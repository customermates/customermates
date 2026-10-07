import type { RecordRevisionChange } from "./record-revision.schema";
import { createHash } from "node:crypto";
import { compareRecordKey } from "./record-json";

import type { Action } from "@/generated/prisma";
import type { ConfigurationChange, ConfigurationPreview } from "./configuration.schema";
import type { RecordField, RecordModel } from "./record-model.schema";
import type { RecordDefinitionDeletion, RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";

import { recordMeasureIsValid } from "./record-measure-validation";
import { recordViewStateIsValid } from "./record-view-state";
import { recordDetailLayoutIsValid } from "./record-detail-layout";
import { UserAccessor } from "@/core/base/user-accessor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWriteError, normalizeRecordScalar } from "./record-write.service";
import { RecordModelSchema } from "./record-model.schema";
import {
  type ModelIssue,
  expressionFieldDependencies,
  expressionRelationshipDependencies,
  validateRecordModel,
} from "./record-model-validation";
import { deterministicId } from "./crm-preset";
import { SYNCHRONOUS_RECORD_LIMIT } from "./record-calculation.service";
import { configurationInputFields, configurationInputValue, fieldValueDefinition } from "./record-configuration-values";
import { canonicalRecordJson } from "./record-json";
import { recordEventSubscriptionIsValid } from "./record-event-subscription-validation";

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

function removeArchivedDefinitions(
  model: RecordModel,
  operations: ConfigurationChange["operations"],
): { deletion: RecordDefinitionDeletion; issues: ModelIssue[] } {
  const typeIds = new Set<string>();
  const fieldIds = new Set<string>();
  const channelTypeIds = new Set<string>();
  for (const operation of operations) {
    if (operation.operation === "deleteType") {
      if (!model.types.some((type) => type.id === operation.typeId && type.archived))
        throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
      typeIds.add(operation.typeId);
    } else if (operation.operation === "deleteField") {
      if (!model.fields.some((field) => field.id === operation.fieldId && field.archived))
        throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
      fieldIds.add(operation.fieldId);
    } else if (operation.operation === "deleteCapability") {
      const binding = model.capabilities.find((candidate) => candidate.id === operation.capabilityId);
      if (binding?.kind !== "channels" || binding.enabled !== false)
        throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
      channelTypeIds.add(binding.typeId);
    } else throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
  }
  for (const field of model.fields) if (typeIds.has(field.typeId)) fieldIds.add(field.id);
  const relationIds = new Set(
    model.relationships
      .filter((relation) => typeIds.has(relation.sourceTypeId) || typeIds.has(relation.targetTypeId))
      .map((relation) => relation.id),
  );
  const crosses = (path: Array<{ relationId: string }>) => path.some((step) => relationIds.has(step.relationId));
  model.types = model.types
    .filter((type) => !typeIds.has(type.id))
    .map((type) =>
      type.relationshipPaths?.some((path) => crosses(path.path))
        ? { ...type, relationshipPaths: type.relationshipPaths.filter((path) => !crosses(path.path)) }
        : type,
    );
  model.fields = model.fields.filter((field) => !fieldIds.has(field.id));
  model.relationships = model.relationships.filter((relation) => !relationIds.has(relation.id));
  model.capabilities = model.capabilities.filter(
    (binding) => !typeIds.has(binding.typeId) && !(binding.kind === "channels" && channelTypeIds.has(binding.typeId)),
  );
  const withoutChannels = (columns: string[]) => columns.filter((column) => column !== "system:channels");
  model.types = model.types.map((type) =>
    channelTypeIds.has(type.id)
      ? {
          ...type,
          defaults: {
            ...type.defaults,
            columns: withoutChannels(type.defaults.columns),
            hiddenColumns: withoutChannels(type.defaults.hiddenColumns),
            pinnedFields: withoutChannels(type.defaults.pinnedFields),
          },
        }
      : type,
  );
  model.activityPaths = model.activityPaths.filter((path) => !typeIds.has(path.typeId) && !crosses(path.path));
  const issues: ModelIssue[] = [];
  for (const field of model.fields) {
    if (field.behavior.kind === "input") continue;
    const fields = expressionFieldDependencies(field.behavior.expression);
    if (field.behavior.kind === "snapshot" && field.behavior.triggerFieldId) fields.add(field.behavior.triggerFieldId);
    if (
      [...fields].some((id) => fieldIds.has(id)) ||
      [...expressionRelationshipDependencies(field.behavior.expression)].some((id) => relationIds.has(id))
    )
      issues.push({ code: "deletion_dependency", fieldId: field.id, typeId: field.typeId });
  }
  for (const type of model.types) {
    if (type.parentRelationshipId && relationIds.has(type.parentRelationshipId))
      issues.push({ code: "deletion_dependency", typeId: type.id });
  }
  return {
    deletion: {
      typeIds: [...typeIds],
      fieldIds: [...fieldIds],
      relationIds: [...relationIds],
      channelTypeIds: [...channelTypeIds].filter((typeId) => !typeIds.has(typeId)),
    },
    issues,
  };
}

export type PreparedConfiguration = {
  change: RecordRevisionChange;
  model: RecordModel;
  preview: ConfigurationPreview;
  deletion: RecordDefinitionDeletion | null;
  grants: Array<{
    typeId: string;
    grants: Array<{ roleId: string; actions: Action[] }>;
  }>;
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
    if (!canConfigureRecords(input, policy))
      throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
    if (input.expectedRevision !== current.revision)
      throw new RecordWriteError(CustomErrorCode.recordSchemaChanged, "conflict");
    const references = new Map<string, string>();
    const register = (reference: string, generated = false) => {
      if (!reference.startsWith("$")) return;
      if (references.has(reference)) {
        if (generated) return;
        throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
      }
      references.set(reference, deterministicId(this.companyId, `configuration:${input.idempotencyKey}:${reference}`));
    };
    for (const operation of input.operations) {
      if (operation.operation === "createType") register(operation.reference);
      if (operation.operation === "putType")
        for (const path of operation.type.relationshipPaths ?? []) register(path.id);

      if (operation.operation === "putField") register(operation.field.id);
      if (operation.operation === "putRelationship") register(operation.relationship.id);
      if (operation.operation === "putAccessPreset") register(operation.preset.id);
      if (operation.operation === "putCapability") register(operation.capability.id);
      if (operation.operation === "putActivityPath") register(operation.activityPath.id);
    }
    for (const operation of input.operations) {
      if (operation.operation === "createType") {
        register(`${operation.reference}.name`, true);
        register(`${operation.reference}.notes`, true);
      }
    }
    const resolve = (reference: string): string => {
      if (reference.startsWith("path:$")) return `path:${resolve(reference.slice(5))}`;
      if (reference.startsWith("relationship:$")) {
        const [, relationId, direction] = reference.split(":");
        return `relationship:${resolve(relationId)}:${direction}`;
      }
      if (!reference.startsWith("$")) return reference;
      const id = references.get(reference);
      if (!id) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
      return id;
    };
    const resolveDefinition = (value: unknown, key = ""): unknown => {
      if (
        typeof value === "string" &&
        [
          "id",
          "typeId",
          "fieldId",
          "primaryFieldId",
          "parentRelationshipId",
          "triggerFieldId",
          "relationId",
          "sourceTypeId",
          "targetTypeId",
          "columns",
          "hiddenColumns",
          "groupBy",
          "sortField",
          "pinnedFields",
        ].includes(key)
      )
        return resolve(value);
      if (Array.isArray(value)) return value.map((item) => resolveDefinition(item, key));
      if (
        !value ||
        typeof value !== "object" ||
        key === "value" ||
        key === "defaultValue" ||
        key === "triggerValue" ||
        key === "options"
      )
        return value;
      return Object.fromEntries(
        Object.entries(value).map(([childKey, child]) => [childKey, resolveDefinition(child, childKey)]),
      );
    };
    const model = structuredClone(current);
    model.revision++;
    const upsert = <T extends { id: string }>(items: T[], item: T) => {
      const index = items.findIndex((candidate) => candidate.id === item.id);
      if (index < 0) items.push(item);
      else items[index] = item;
    };
    const reorderedTypes = new Set<string>();
    const grants: PreparedConfiguration["grants"] = [];
    const previousGrants = input.operations.some(
      (operation) => operation.operation === "setTypeGrants" || operation.operation === "createType",
    )
      ? await this.records.getGrants()
      : [];
    for (const operation of input.operations) {
      if (operation.operation === "putAccessPreset") {
        if (!policy.canManageRoles) throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
        if (!(await this.records.validRecordRolesCompanyWide(operation.preset.grants.map((grant) => grant.roleId))))
          throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
        upsert(model.accessPresets, {
          ...operation.preset,
          id: resolve(operation.preset.id),
        });
      }
    }
    for (const operation of input.operations) {
      if (operation.operation === "createType") {
        const id = resolve(operation.reference);
        if (model.types.some((type) => type.id === id))
          throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
        const nameId =
          references.get(`${operation.reference}.name`) ??
          deterministicId(this.companyId, `configuration:${input.idempotencyKey}:${id}:name`);
        const notesId =
          references.get(`${operation.reference}.notes`) ??
          deterministicId(this.companyId, `configuration:${input.idempotencyKey}:${id}:notes`);
        model.types.push({
          id,
          label: operation.label,
          pluralLabel: operation.pluralLabel,
          description: operation.description,
          icon: operation.icon,
          embedded: operation.embedded,
          navigationVisible: operation.navigationVisible ?? !operation.embedded,
          archived: false,
          position: Math.max(-1, ...model.types.map((type) => type.position)) + 1,
          primaryFieldId: nameId,
          parentRelationshipId: null,
          defaults: {
            columns: [nameId],
            hiddenColumns: [],
            layout: "table",
            groupBy: null,
            sortField: null,
            sortDirection: "asc",
            pinnedFields: [nameId],
          },
        });
        for (const [fieldId, label, valueType, required] of [
          [nameId, operation.label, "text", true],
          [notesId, "Notes", "richText", false],
        ] as const) {
          model.fields.push({
            id: fieldId,
            typeId: id,
            label,
            valueType,
            required,
            behavior: { kind: "input" },
            archived: false,
            publishedSummary: false,
            options: [],
            position: required ? 0 : 1,
          });
        }
        model.activityPaths.push({
          id: deterministicId(this.companyId, `activities:${id}:self`),
          typeId: id,
          label: operation.pluralLabel,
          path: [],
          includeMessages: false,
          includeAudit: true,
          archived: false,
        });
        if (operation.accessPresetId) {
          const preset = model.accessPresets.find(
            (preset) => preset.id === resolve(operation.accessPresetId ?? "") && !preset.archived,
          );
          if (!preset) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
          grants.push({ typeId: id, grants: preset.grants });
        }
      }
      if (operation.operation === "putType") {
        const type = resolveDefinition(operation.type) as RecordModel["types"][number];
        const existing = current.types.find((candidate) => candidate.id === type.id);
        if ((existing?.parentRelationshipId ?? null) !== type.parentRelationshipId && !policy.canManageRoles)
          throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
        upsert(model.types, type);
      }
      if (operation.operation === "putField") {
        const field = resolveDefinition(operation.field) as Omit<RecordField, "publishedSummary">;
        const existing = current.fields.find((candidate) => candidate.id === field.id);
        if (existing && existing.typeId !== field.typeId)
          throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
        if (existing && existing.position !== field.position) reorderedTypes.add(field.typeId);
        upsert(model.fields, {
          ...field,
          publishedSummary: field.behavior.kind === "input" ? false : (existing?.publishedSummary ?? false),
        });
      }
      if (operation.operation === "putRelationship") {
        const relation = resolveDefinition(operation.relationship) as RecordModel["relationships"][number];
        const existing = current.relationships.find((candidate) => candidate.id === relation.id);
        if (
          existing &&
          (existing.sourceTypeId !== relation.sourceTypeId || existing.targetTypeId !== relation.targetTypeId)
        )
          throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
        upsert(model.relationships, relation);
      }
      if (operation.operation === "setTypeGrants") {
        if (!policy.canManageRoles) throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
        const typeId = resolve(operation.typeId);
        if (
          grants.some((grant) => grant.typeId === typeId) ||
          new Set(operation.grants.map((grant) => grant.roleId)).size !== operation.grants.length ||
          operation.grants.some((grant) => new Set(grant.actions).size !== grant.actions.length) ||
          !(await this.records.validRecordRolesCompanyWide(operation.grants.map((grant) => grant.roleId)))
        )
          throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
        if (!policy.isAdmin && policy.actor?.role) {
          const previous =
            previousGrants.find((grant) => grant.typeId === typeId && grant.roleId === policy.actor?.role?.id)
              ?.actions ?? [];
          const next = operation.grants.find((grant) => grant.roleId === policy.actor?.role?.id)?.actions ?? [];
          if ([...previous].sort().join() !== [...next].sort().join())
            throw new RecordWriteError(CustomErrorCode.roleSelfEditForbidden, "authorization");
        }
        grants.push({ typeId, grants: operation.grants });
      }
      if (operation.operation === "putCapability") {
        const binding = resolveDefinition(operation.capability) as RecordModel["capabilities"][number];
        const existing = current.capabilities.find((candidate) => candidate.id === binding.id);
        if (binding.kind !== "channels" && !policy.isAdmin)
          throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
        const protectedKind = (kind: string) => kind === "membershipAuthorization";
        if (
          (existing && (existing.typeId !== binding.typeId || existing.kind !== binding.kind)) ||
          (existing && protectedKind(existing.kind) && JSON.stringify(existing) !== JSON.stringify(binding)) ||
          (!existing && protectedKind(binding.kind))
        )
          throw new RecordWriteError(CustomErrorCode.recordProtected, "authorization");
        upsert(model.capabilities, binding);
        if (binding.kind === "channels" && binding.enabled !== false && (!existing || existing.enabled === false)) {
          const selfId = deterministicId(this.companyId, `activities:${binding.typeId}:self`);
          const self = model.activityPaths.find((path) => path.id === selfId);
          const type = model.types.find((type) => type.id === binding.typeId);
          if (self) self.includeMessages = true;
          else if (type) {
            model.activityPaths.push({
              id: selfId,
              typeId: type.id,
              label: type.pluralLabel,
              path: [],
              includeMessages: true,
              includeAudit: true,
              archived: false,
            });
          }
        }
      }
      if (operation.operation === "putActivityPath")
        upsert(model.activityPaths, resolveDefinition(operation.activityPath) as RecordModel["activityPaths"][number]);
    }
    const removed = input.operations.some(
      (operation) =>
        operation.operation === "deleteType" ||
        operation.operation === "deleteField" ||
        operation.operation === "deleteCapability",
    )
      ? removeArchivedDefinitions(model, input.operations)
      : null;
    if (removed?.deletion.typeIds.length && !policy.canManageRoles)
      throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
    if (removed?.deletion.channelTypeIds.some((typeId) => !policy.isAdmin && !policy.allowed(typeId, "readAll")))
      throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
    for (const typeId of reorderedTypes) {
      const slots = model.fields.flatMap((field, index) => (field.typeId === typeId ? [index] : []));
      const ordered = slots.map((index) => model.fields[index]).sort((left, right) => left.position - right.position);
      slots.forEach((slot, offset) => {
        model.fields[slot] = ordered[offset];
      });
    }
    if (!RecordModelSchema.safeParse(model).success)
      throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
    const validation = validateRecordModel(model);
    validation.issues.push(...(removed?.issues ?? []));
    const approvals = new Map(
      input.operations
        .filter((operation) => operation.operation === "publishSummary")
        .map((operation) => [resolve(operation.fieldId), operation]),
    );
    for (const field of model.fields) {
      if (field.behavior.kind === "input" && field.behavior.defaultValue)
        normalizeRecordScalar(field.behavior.defaultValue, field);
      const approval = approvals.get(field.id);
      if (approval) {
        if (!policy.isAdmin) throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
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
    const changedTypes = new Set<string>();
    for (const field of model.fields) {
      const before = current.fields.find((candidate) => candidate.id === field.id);
      if (fieldValueDefinition(before) !== fieldValueDefinition(field)) changedTypes.add(field.typeId);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const field of model.fields) {
        if (
          !changedTypes.has(field.typeId) &&
          field.behavior.kind !== "input" &&
          [...expressionFieldDependencies(field.behavior.expression)].some((id) =>
            changedTypes.has(model.fields.find((candidate) => candidate.id === id)?.typeId ?? ""),
          )
        ) {
          changedTypes.add(field.typeId);
          changed = true;
        }
      }
    }
    const viewTypes = new Set([...changedTypes, ...(removed?.deletion.channelTypeIds ?? [])]);
    const changedRelations = new Set(
      [...current.relationships, ...model.relationships]
        .filter(
          (relation) =>
            JSON.stringify(current.relationships.find((before) => before.id === relation.id)) !==
            JSON.stringify(model.relationships.find((after) => after.id === relation.id)),
        )
        .map((relation) => relation.id),
    );
    for (const type of model.types) {
      const before = current.types.find((before) => before.id === type.id);
      if (
        JSON.stringify(before) !== JSON.stringify(type) ||
        [...current.relationships, ...model.relationships].some(
          (relation) =>
            changedRelations.has(relation.id) &&
            (relation.sourceTypeId === type.id || relation.targetTypeId === type.id),
        ) ||
        [...(before?.relationshipPaths ?? []), ...(type.relationshipPaths ?? [])].some((path) =>
          path.path.some((step) => changedRelations.has(step.relationId)),
        )
      )
        viewTypes.add(type.id);
    }
    if (viewTypes.size) {
      let layoutCursor: string | undefined;
      const blockedLayouts = new Set<string>();
      for (;;) {
        const layouts = await this.records.getDetailLayoutsCompanyWide([...viewTypes], layoutCursor);
        for (const entry of layouts) {
          if (!blockedLayouts.has(entry.typeId) && !recordDetailLayoutIsValid(entry.typeId, entry.layout, model)) {
            blockedLayouts.add(entry.typeId);
            validation.issues.push({
              code: "detail_layout_incompatible",
              typeId: entry.typeId,
            });
          }
        }
        const last = layouts.at(-1);
        if (!last || layouts.length < 200) break;
        layoutCursor = last.id;
      }
      let cursor = "";
      const blockedTypes = new Set<string>();
      for (;;) {
        const consumers = await this.records.getViewStatesCompanyWide([...viewTypes], cursor);
        for (const consumer of consumers) {
          if (blockedTypes.has(consumer.typeId)) continue;
          if (!recordViewStateIsValid(consumer.typeId, consumer.state, model)) {
            blockedTypes.add(consumer.typeId);
            validation.issues.push({
              code: "saved_view_incompatible",
              typeId: consumer.typeId,
            });
          }
        }
        const last = consumers.at(-1);
        if (!last || consumers.length < 200) break;
        cursor = last.key;
      }
    }
    let widgetCursor = "";
    for (;;) {
      const widgets = await this.records.getWidgetMeasuresCompanyWide(widgetCursor);
      for (const widget of widgets) {
        if (!recordMeasureIsValid(widget.measure, model)) {
          validation.issues.push({
            code: "widget_incompatible",
            typeId: widget.measure.source.typeId,
          });
        }
      }
      const last = widgets.at(-1);
      if (!last || widgets.length < 200) break;
      widgetCursor = last.id;
    }
    let activityWidgetCursor = "";
    for (;;) {
      const widgets = await this.records.getActivityWidgetQueriesCompanyWide(activityWidgetCursor);
      for (const { query } of widgets) {
        const typeIds = [
          ...query.scope.typeIds,
          ...query.scope.records.map((ref) => ref.typeId),
          ...(query.filters ?? []).flatMap((filter) => (filter.kind === "record" ? [filter.typeId] : [])),
        ];
        for (const typeId of new Set(typeIds)) {
          if (!model.types.some((type) => type.id === typeId && !type.archived))
            validation.issues.push({ code: "widget_incompatible", typeId });
        }
      }
      const last = widgets.at(-1);
      if (!last || widgets.length < 200) break;
      activityWidgetCursor = last.id;
    }
    let subscriptionCursor: string | undefined;
    for (;;) {
      const subscriptions = await this.records.getEventSubscriptionsCompanyWide(subscriptionCursor);
      for (const subscription of subscriptions) {
        if (!recordEventSubscriptionIsValid(subscription, model)) {
          validation.issues.push({
            code: "event_subscription_incompatible",
            typeId: subscription.typeId ?? undefined,
          });
        }
      }
      const last = subscriptions.at(-1);
      if (!last || subscriptions.length < 200) break;
      subscriptionCursor = last.id;
    }
    const affectedRecords = await this.records.countRecordsCompanyWide([...changedTypes]);
    const inputs = configurationInputFields(current, model);
    const inputTypes = [...new Set(inputs.map((field) => field.typeId))];
    const validationCount = await this.records.countRecordsCompanyWide(inputTypes);
    const dataValidation = validationCount > SYNCHRONOUS_RECORD_LIMIT ? "staged" : "complete";
    if (dataValidation === "complete") {
      const invalid = new Set<string>();
      for (const typeId of inputTypes) {
        const refs = await this.records.getRecordRefsCompanyWide(typeId, undefined, SYNCHRONOUS_RECORD_LIMIT + 1);
        const rows = await this.records.getRecordsCompanyWide(refs);
        for (const row of rows) {
          for (const field of inputs.filter((field) => field.typeId === typeId)) {
            if (invalid.has(field.id)) continue;
            try {
              configurationInputValue(
                row,
                current.fields.find((before) => before.id === field.id),
                field,
              );
            } catch (error) {
              if (!(error instanceof RecordWriteError)) throw error;
              invalid.add(field.id);
              validation.issues.push({
                code: "existing_values_incompatible",
                fieldId: field.id,
                typeId,
              });
            }
          }
        }
      }
    }
    return {
      change: {
        version: 1,
        source: { kind: "configuration" },
        causeId: input.idempotencyKey,
        expectedRevision: current.revision,
        configuration: input,
        references: [...references].map(([reference, id]) => ({
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
      deletion: removed?.deletion ?? null,
      affectedTypeIds: [...changedTypes],
      preview: {
        expectedRevision: current.revision,
        nextRevision: model.revision,
        valid: !validation.issues.length,
        execution: affectedRecords > SYNCHRONOUS_RECORD_LIMIT ? "background" : "synchronous",
        dataValidation,
        affectedRecords,
        references: [...references].map(([reference, id]) => ({
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
        ...(removed ? { deletion: await this.records.countDefinitionDeletion(removed.deletion) } : {}),
      },
    };
  }
}
