import { failureUnwindCause, unwindFailure } from "@/core/validation/failure-unwind";
import type { RecordRevisionChange } from "./record-revision.schema";
import { createHash } from "node:crypto";
import { compareRecordKey } from "./record-json";

import type { ConfigurationChange, ConfigurationPreview } from "./configuration.schema";
import type { RecordField, RecordModel } from "./record-model.schema";
import type { ConfigurationConsumerCleanup, RecordDefinitionDeletion, RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";

import {
  applyConfigurationLifecycle,
  assignMissingNameFields,
  deletionReference,
  isLifecycleOperation,
} from "./configuration-lifecycle";
import { UserAccessor } from "@/core/base/user-accessor";
import { configurationReferences } from "./configuration-references";
import {
  applyConfigurationOperations,
  reorderConfiguredFields,
  type ConfigurationGrants,
} from "./configuration-operations";
import { collectConsumerImpact, configurationTypeChanges, recordPages } from "./configuration-consumer-impact";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { normalizeRecordScalar } from "./record-write.service";
import { RecordModelSchema } from "./record-model.schema";
import {
  expressionFieldDependencies,
  expressionRelationshipDependencies,
  validateRecordModel,
} from "./record-model-validation";
import { SYNCHRONOUS_RECORD_LIMIT } from "./record-calculation.service";
import {
  configurationInputFields,
  configurationInputValue,
  configurationValueExample,
} from "./record-configuration-values";
import { canonicalRecordJson } from "./record-json";
import { duplicateNameIssues } from "./record-names";

export function calculationDependencyHash(field: RecordField, model: RecordModel): string {
  const visited = new Set<string>();
  const fingerprint = (definition: RecordField): unknown => {
    if (visited.has(definition.id)) return definition.id;
    visited.add(definition.id);
    return {
      id: definition.id,
      typeId: definition.typeId,
      valueType: definition.valueType,
      multiple: definition.multiple ?? false,
      behavior: definition.behavior,
      options: definition.options
        .map((option) => ({
          id: option.id,
          attributes: [...option.attributes].sort((a, b) => compareRecordKey(a.key, b.key)),
        }))
        .sort((a, b) => compareRecordKey(a.id, b.id)),
      fields:
        definition.behavior.kind === "input"
          ? []
          : [...expressionFieldDependencies(definition.behavior.expression)]
              .sort()
              .map((id) => model.fields.find((candidate) => candidate.id === id))
              .filter((value): value is RecordField => Boolean(value))
              .map(fingerprint),
      relationships:
        definition.behavior.kind === "input"
          ? []
          : [...expressionRelationshipDependencies(definition.behavior.expression)].sort().map((id) => {
              const relation = model.relationships.find((candidate) => candidate.id === id);
              return relation
                ? {
                    id,
                    sourceTypeId: relation.sourceTypeId,
                    targetTypeId: relation.targetTypeId,
                    sourceCardinality: relation.sourceCardinality,
                    targetCardinality: relation.targetCardinality,
                    archived: relation.archived,
                  }
                : { id };
            }),
    };
  };
  return createHash("sha256")
    .update(canonicalRecordJson(fingerprint(field)))
    .digest("hex");
}

export type PreparedConfiguration = {
  change: RecordRevisionChange;
  model: RecordModel;
  preview: ConfigurationPreview;
  deletion: RecordDefinitionDeletion | null;
  cleanups: ConfigurationConsumerCleanup[];
  grants: ConfigurationGrants;
  affectedTypeIds: string[];
};

export function canConfigureRecords(
  input: ConfigurationChange,
  policy: Awaited<ReturnType<RecordAccessPolicy["load"]>>,
): boolean {
  return Boolean(
    policy.actor &&
      (policy.canManageSchema ||
        (policy.canManageRoles &&
          input.operations.every((operation) => ["setTypeGrants", "putAccessPreset"].includes(operation.operation)))),
  );
}

export class RecordConfigurationService extends UserAccessor {
  constructor(private records: RecordRepo) {
    super();
  }

  async prepare(
    input: ConfigurationChange,
    current: RecordModel,
    policy: Awaited<ReturnType<RecordAccessPolicy["load"]>>,
  ): Promise<PreparedConfiguration> {
    if (!canConfigureRecords(input, policy)) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
    if (input.expectedRevision !== current.revision)
      throw unwindFailure(CustomErrorCode.recordSchemaChanged, "conflict");
    const references = configurationReferences(input, () => this.companyId);
    const model = structuredClone(current);
    model.revision++;
    const previousGrants = input.operations.some(
      (operation) => operation.operation === "setTypeGrants" || operation.operation === "createType",
    )
      ? await this.records.getGrants()
      : [];
    const { grants, reorderedTypes } = await applyConfigurationOperations(model, current, input, {
      companyId: () => this.companyId,
      policy,
      references,
      previousGrants,
      validRoles: (roleIds) => this.records.validRecordRolesCompanyWide(roleIds),
    });
    const lifecycle = input.operations.some(isLifecycleOperation)
      ? applyConfigurationLifecycle(
          model,
          input.operations,
          await this.records.getConfigurationDeletions(
            input.operations.flatMap((operation) => (isLifecycleOperation(operation) ? [operation.target] : [])),
          ),
        )
      : null;
    if (lifecycle?.removed?.typeIds.length && !policy.canManageRoles)
      throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
    if (lifecycle?.removed?.channelTypeIds.some((typeId) => !policy.isAdmin && !policy.allowed(typeId, "readAll")))
      throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
    const deletedTypeIds = new Set(
      lifecycle?.deletedTargets.filter((target) => target.kind === "type").map((target) => target.id),
    );
    const cause = lifecycle?.deletions[0] ? deletionReference(current, lifecycle.deletions[0].target) : null;
    const blockers = [...(lifecycle?.blockers ?? [])];
    const cleaned = [...(lifecycle?.cleaned ?? [])];
    const cleanups: ConfigurationConsumerCleanup[] = [];
    reorderConfiguredFields(model, reorderedTypes);
    assignMissingNameFields(model);
    if (!RecordModelSchema.safeParse(model).success) throw unwindFailure(CustomErrorCode.recordConfigurationInvalid);
    const validation = validateRecordModel(model);
    validation.issues.push(...duplicateNameIssues(model, current));
    const removed = lifecycle?.removed ? { deletion: lifecycle.removed } : null;
    const readsFully = (typeId: string) =>
      policy.isAdmin || !current.types.some((type) => type.id === typeId) || policy.readScope(typeId) === "all";
    if (removed) {
      for (const typeId of removed.deletion.typeIds) {
        if (!readsFully(typeId) && (await this.records.countRecordsCompanyWide([typeId])) > 0)
          validation.issues.push({ code: "deletion_requires_read_all", typeId });
      }
      for (const fieldId of removed.deletion.fieldIds) {
        const field = current.fields.find((candidate) => candidate.id === fieldId);
        if (!field || removed.deletion.typeIds.includes(field.typeId) || readsFully(field.typeId)) continue;
        const stored = await this.records.countDefinitionDeletion({
          typeIds: [],
          fieldIds: [fieldId],
          relationIds: [],
          channelTypeIds: [],
        });
        if (stored.values)
          validation.issues.push({ code: "deletion_requires_read_all", fieldId, typeId: field.typeId });
      }
      for (const typeId of removed.deletion.channelTypeIds) {
        if (removed.deletion.typeIds.includes(typeId) || readsFully(typeId)) continue;
        const stored = await this.records.countDefinitionDeletion({
          typeIds: [],
          fieldIds: [],
          relationIds: [],
          channelTypeIds: [typeId],
        });
        if (stored.identifiers) validation.issues.push({ code: "deletion_requires_read_all", typeId });
      }
    }
    const approvals = new Map(
      input.operations
        .filter((operation) => operation.operation === "publishSummary")
        .map((operation) => [references.resolve(operation.fieldId), operation]),
    );
    for (const field of model.fields) {
      if (field.behavior.kind === "input" && field.behavior.defaultValue)
        normalizeRecordScalar(field.behavior.defaultValue, field);
      const approval = approvals.get(field.id);
      if (approval) {
        if (!policy.isAdmin) throw unwindFailure(CustomErrorCode.permissionDenied, "authorization");
        if (approval.dependencyHash !== calculationDependencyHash(field, model)) {
          validation.issues.push({
            code: "summary_approval_changed",
            fieldId: field.id,
          });
        } else field.publishedSummary = approval.published;
      } else {
        const existing = current.fields.find((candidate) => candidate.id === field.id);
        if (
          existing?.publishedSummary &&
          field.behavior.kind !== "input" &&
          calculationDependencyHash(existing, current) !== calculationDependencyHash(field, model)
        ) {
          validation.issues.push({
            code: "summary_approval_required",
            fieldId: field.id,
          });
        }
      }
    }
    for (const grant of grants) {
      if (!model.types.some((type) => type.id === grant.typeId && !type.embedded)) {
        validation.issues.push({
          code: "invalid_grant_type",
          typeId: grant.typeId,
        });
      }
    }
    const { changedTypes, viewTypes } = configurationTypeChanges(
      current,
      model,
      lifecycle?.removed?.channelTypeIds,
      validation.issues,
    );
    await collectConsumerImpact(
      current,
      model,
      { viewTypes, deletedTypeIds, cause },
      {
        detailLayouts: recordPages(
          (cursor) => this.records.getDetailLayoutsCompanyWide([...viewTypes], cursor),
          (layout) => layout.id,
        ),
        viewStates: recordPages(
          (cursor) => this.records.getViewStatesCompanyWide([...viewTypes], cursor),
          (state) => state.key,
        ),
        widgetMeasures: recordPages(
          (cursor) => this.records.getWidgetMeasuresCompanyWide(cursor),
          (widget) => widget.id,
        ),
        activityWidgets: recordPages(
          (cursor) => this.records.getActivityWidgetQueriesCompanyWide(cursor),
          (widget) => widget.id,
        ),
        eventSubscriptions: recordPages(
          (cursor) => this.records.getEventSubscriptionsCompanyWide(cursor),
          (subscription) => subscription.id,
        ),
      },
      { issues: validation.issues, blockers, cleaned, cleanups },
    );
    const affectedRecords = await this.records.countRecordsCompanyWide([...changedTypes]);
    const affectedReadable = [...changedTypes].every(readsFully);
    const inputs = configurationInputFields(current, model);
    const inputTypes = [...new Set(inputs.map((field) => field.typeId))];
    const checkedTypes = inputTypes.filter(readsFully);
    const validationCount = await this.records.countRecordsCompanyWide(checkedTypes);
    const dataValidation =
      checkedTypes.length < inputTypes.length || validationCount > SYNCHRONOUS_RECORD_LIMIT ? "staged" : "complete";
    if (validationCount <= SYNCHRONOUS_RECORD_LIMIT) {
      const invalid = new Map<string, { typeId: string; count: number; examples: string[] }>();
      for (const typeId of checkedTypes) {
        const refs = await this.records.getRecordRefsCompanyWide(typeId, undefined, SYNCHRONOUS_RECORD_LIMIT + 1, {
          includeTrash: true,
        });
        const rows = await this.records.getRecordsCompanyWide(refs, { includeTrash: true });
        for (const row of rows) {
          for (const field of inputs.filter((field) => field.typeId === typeId)) {
            const before = current.fields.find((candidate) => candidate.id === field.id);
            try {
              configurationInputValue(row, before, field);
            } catch (error) {
              if (!failureUnwindCause(error)) throw error;
              const entry = invalid.get(field.id) ?? { typeId, count: 0, examples: [] };
              const example = configurationValueExample(row, before);
              entry.count += 1;
              if (example !== null && entry.examples.length < 3 && !entry.examples.includes(example))
                entry.examples.push(example);
              invalid.set(field.id, entry);
            }
          }
        }
      }
      for (const [fieldId, { typeId, count, examples }] of invalid)
        validation.issues.push({ code: "existing_values_incompatible", fieldId, typeId, count, examples });
    }
    const deletionCounts = removed ? await this.records.countDefinitionDeletion(removed.deletion) : null;
    const deletionReadable =
      !removed ||
      [
        ...removed.deletion.typeIds,
        ...removed.deletion.channelTypeIds,
        ...removed.deletion.fieldIds.flatMap(
          (fieldId) => current.fields.find((field) => field.id === fieldId)?.typeId ?? [],
        ),
        ...removed.deletion.relationIds.flatMap((relationId) => {
          const relation = current.relationships.find((candidate) => candidate.id === relationId);
          return relation ? [relation.sourceTypeId, relation.targetTypeId] : [];
        }),
      ].every(readsFully);
    const hiddenDeletion =
      !deletionReadable &&
      Boolean(
        deletionCounts &&
          (deletionCounts.records || deletionCounts.values || deletionCounts.links || deletionCounts.identifiers),
      );
    const deletion =
      deletionCounts && hiddenDeletion
        ? { ...deletionCounts, records: null, values: null, links: null, identifiers: null, identifierRecords: null }
        : deletionCounts;
    return {
      change: {
        version: 1,
        source: { kind: "configuration" },
        causeId: input.idempotencyKey,
        expectedRevision: current.revision,
        configuration: input,
        ...(lifecycle?.deletions.length ? { deletions: lifecycle.deletions } : {}),
        references: [...references.references].map(([reference, id]) => ({
          reference,
          id,
        })),
        grants: grants.map(({ typeId, grants: after }) => ({
          typeId,
          before: previousGrants
            .filter((grant) => grant.typeId === typeId)
            .map(({ roleId, actions }) => ({ roleId, actions })),
          after,
        })),
      },
      model,
      grants,
      deletion: lifecycle?.removed ?? null,
      cleanups,
      affectedTypeIds: [...changedTypes],
      preview: {
        expectedRevision: current.revision,
        nextRevision: model.revision,
        valid: !validation.issues.length && !blockers.length,
        execution: affectedRecords > SYNCHRONOUS_RECORD_LIMIT ? "background" : "synchronous",
        dataValidation,
        affectedRecords: affectedReadable || affectedRecords === 0 ? affectedRecords : null,
        hiddenRecords: (!affectedReadable && affectedRecords > 0) || hiddenDeletion,
        references: [...references.references].map(([reference, id]) => ({
          reference,
          id,
        })),
        issues: validation.issues,
        calculations: model.fields
          .filter((field) => !field.archived && field.behavior.kind !== "input")
          .map((field) => ({
            fieldId: field.id,
            dependencyHash: calculationDependencyHash(field, model),
          })),
        ...(lifecycle ? { deletion: { blockers, cleaned, removed: deletion } } : {}),
      },
    };
  }
}
