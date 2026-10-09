import type { RecordRevisionChange } from "./record-revision.schema";
import { createHash } from "node:crypto";
import { compareRecordKey } from "./record-json";

import type { Action } from "@/generated/prisma";
import type { ConfigurationChange, ConfigurationPreview } from "./configuration.schema";
import type { RecordField, RecordModel } from "./record-model.schema";
import type { ConfigurationConsumerCleanup, RecordDefinitionDeletion, RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";

import { cleanRecordMeasure, recordMeasureIsValid } from "./record-measure-validation";
import { cleanRecordViewState, recordViewStateIsValid } from "./record-view-state";
import { cleanRecordDetailLayout, recordDetailLayoutIsValid } from "./record-detail-layout";
import { applyConfigurationLifecycle, deletionReference, isLifecycleOperation } from "./configuration-lifecycle";
import { UserAccessor } from "@/core/base/user-accessor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWriteError, normalizeRecordScalar } from "./record-write.service";
import { RecordModelSchema } from "./record-model.schema";
import {
  expressionFieldDependencies,
  expressionRelationshipDependencies,
  validateRecordModel,
} from "./record-model-validation";
import { deterministicId } from "./crm-preset";
import { SYNCHRONOUS_RECORD_LIMIT } from "./record-calculation.service";
import { configurationInputFields, configurationInputValue, fieldValueDefinition } from "./record-configuration-values";
import { canonicalRecordJson } from "./record-json";
import { duplicateNameIssues } from "./record-names";
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

export type PreparedConfiguration = {
  change: RecordRevisionChange;
  model: RecordModel;
  preview: ConfigurationPreview;
  deletion: RecordDefinitionDeletion | null;
  cleanups: ConfigurationConsumerCleanup[];
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
        if (operation.accessPresetId) {
          const preset = model.accessPresets.find(
            (preset) => preset.id === resolve(operation.accessPresetId ?? "") && !preset.archived,
          );
          if (!preset) throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
          grants.push({ typeId: id, grants: preset.grants });
        }
      }
      if (operation.operation === "putType") {
        const input = resolveDefinition(operation.type) as Omit<RecordModel["types"][number], "archived">;
        const existing = current.types.find((candidate) => candidate.id === input.id);
        const type = {
          ...input,
          archived: existing?.archived ?? false,
          ...(input.relationshipPaths
            ? {
                relationshipPaths: input.relationshipPaths.map((path) => ({
                  ...path,
                  archived: existing?.relationshipPaths?.find((before) => before.id === path.id)?.archived ?? false,
                })),
              }
            : {}),
        } as RecordModel["types"][number];
        if ((existing?.parentRelationshipId ?? null) !== type.parentRelationshipId && !policy.canManageRoles)
          throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
        upsert(model.types, type);
      }
      if (operation.operation === "putField") {
        const input = resolveDefinition(operation.field) as Omit<RecordField, "publishedSummary" | "archived">;
        const existing = current.fields.find((candidate) => candidate.id === input.id);
        const field = { ...input, archived: existing?.archived ?? false };
        if (existing && existing.typeId !== field.typeId)
          throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
        if (existing && existing.position !== field.position) reorderedTypes.add(field.typeId);
        upsert(model.fields, {
          ...field,
          publishedSummary: field.behavior.kind === "input" ? false : (existing?.publishedSummary ?? false),
        });
      }
      if (operation.operation === "putRelationship") {
        const input = resolveDefinition(operation.relationship) as Omit<
          RecordModel["relationships"][number],
          "archived"
        >;
        const existing = current.relationships.find((candidate) => candidate.id === input.id);
        const relation = { ...input, archived: existing?.archived ?? false };
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
        const input = resolveDefinition(operation.capability) as RecordModel["capabilities"][number];
        const existing = current.capabilities.find((candidate) => candidate.id === input.id);
        const binding =
          input.kind === "channels" && existing?.kind === "channels"
            ? { ...input, enabled: existing.enabled !== false }
            : input.kind === "channels"
              ? { ...input, enabled: true }
              : input;
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
      }
    }
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
      throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
    if (lifecycle?.removed?.channelTypeIds.some((typeId) => !policy.isAdmin && !policy.allowed(typeId, "readAll")))
      throw new RecordWriteError(CustomErrorCode.permissionDenied, "authorization");
    const deletedTypeIds = new Set(
      lifecycle?.deletedTargets.filter((target) => target.kind === "type").map((target) => target.id),
    );
    const cause = lifecycle?.deletions[0] ? deletionReference(current, lifecycle.deletions[0].target) : null;
    const blockers = [...(lifecycle?.blockers ?? [])];
    const cleaned = [...(lifecycle?.cleaned ?? [])];
    const cleanups: ConfigurationConsumerCleanup[] = [];
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
    const viewTypes = new Set([
      ...changedTypes,
      ...(lifecycle?.removed?.channelTypeIds ?? []),
      ...(lifecycle?.channelTypeIds ?? []),
    ]);
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
          if (deletedTypeIds.has(entry.typeId) || recordDetailLayoutIsValid(entry.typeId, entry.layout, model))
            continue;
          const layout =
            cause && recordDetailLayoutIsValid(entry.typeId, entry.layout, current)
              ? cleanRecordDetailLayout(entry.typeId, entry.layout, model)
              : null;
          if (cause && layout) {
            cleanups.push({ kind: "detailLayout", id: entry.id, layout });
            cleaned.push({
              consumer: { kind: "detailLayout", id: entry.id, typeId: entry.typeId, label: "" },
              target: cause,
            });
            continue;
          }
          if (!blockedLayouts.has(entry.typeId)) {
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
          if (deletedTypeIds.has(consumer.typeId) || recordViewStateIsValid(consumer.typeId, consumer.state, model))
            continue;
          const state =
            cause && recordViewStateIsValid(consumer.typeId, consumer.state, current)
              ? cleanRecordViewState(consumer.typeId, consumer.state, model)
              : null;
          if (cause && state) {
            const kind = consumer.key.startsWith("view:") ? "view" : "personalLayout";
            const id = consumer.key.slice(consumer.key.indexOf(":") + 1);
            cleanups.push({ kind, id, state });
            cleaned.push({
              consumer: { kind, id, typeId: consumer.typeId, label: consumer.name ?? "" },
              target: cause,
            });
            continue;
          }
          if (blockedTypes.has(consumer.typeId)) continue;
          {
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
        if (recordMeasureIsValid(widget.measure, model)) continue;
        if (cause && recordMeasureIsValid(widget.measure, current)) {
          const measure = cleanRecordMeasure(widget.measure, model);
          const consumer = { kind: "widget" as const, id: widget.id, label: widget.name };
          if (measure) {
            cleanups.push({ kind: "widget", id: widget.id, measure });
            cleaned.push({ consumer, target: cause });
          } else blockers.push({ reason: "widget", source: consumer, target: cause });
          continue;
        }
        {
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
      for (const { id, name, query } of widgets) {
        const typeIds = [
          ...query.scope.typeIds,
          ...query.scope.records.map((ref) => ref.typeId),
          ...(query.filters ?? []).flatMap((filter) => (filter.kind === "record" ? [filter.typeId] : [])),
        ];
        for (const typeId of new Set(typeIds)) {
          if (model.types.some((type) => type.id === typeId && !type.archived)) continue;
          if (cause && deletedTypeIds.has(typeId))
            blockers.push({ reason: "widget", source: { kind: "widget", id, label: name }, target: cause });
          else validation.issues.push({ code: "widget_incompatible", typeId });
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
        if (recordEventSubscriptionIsValid(subscription, model)) continue;
        if (cause && recordEventSubscriptionIsValid(subscription, current)) {
          blockers.push({
            reason: subscription.kind,
            source: { kind: subscription.kind, id: subscription.id, label: subscription.label },
            target: cause,
          });
          continue;
        }
        {
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
    const affectedReadable = [...changedTypes].every(readsFully);
    const inputs = configurationInputFields(current, model);
    const inputTypes = [...new Set(inputs.map((field) => field.typeId))];
    const checkedTypes = inputTypes.filter(readsFully);
    const validationCount = await this.records.countRecordsCompanyWide(checkedTypes);
    const dataValidation =
      checkedTypes.length < inputTypes.length || validationCount > SYNCHRONOUS_RECORD_LIMIT ? "staged" : "complete";
    if (validationCount <= SYNCHRONOUS_RECORD_LIMIT) {
      const invalid = new Set<string>();
      for (const typeId of checkedTypes) {
        const refs = await this.records.getRecordRefsCompanyWide(typeId, undefined, SYNCHRONOUS_RECORD_LIMIT + 1, {
          includeTrash: true,
        });
        const rows = await this.records.getRecordsCompanyWide(refs, { includeTrash: true });
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
        ...(lifecycle ? { deletion: { blockers, cleaned, removed: deletion } } : {}),
      },
    };
  }
}
