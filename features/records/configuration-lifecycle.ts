import type {
  ConfigurationChange,
  ConfigurationTarget,
  DeletionBlocker,
  DeletionCleanup,
  DeletionReference,
} from "./configuration.schema";
import type { RecordModel, RecordType } from "./record-model.schema";
import type { RecordDefinitionDeletion } from "./record.repo";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWriteError } from "./record-write.service";
import { expressionFieldDependencies, expressionRelationshipDependencies } from "./record-model-validation";

export type ConfigurationDeletion = { target: ConfigurationTarget; cascade: ConfigurationTarget[] };
export type ConfigurationDeletionRecord = ConfigurationDeletion & { actorId: string; deletedAt: Date };

export type ConfigurationLifecycle = {
  deletions: ConfigurationDeletion[];
  removed: RecordDefinitionDeletion | null;
  blockers: DeletionBlocker[];
  cleaned: DeletionCleanup[];
  deletedTargets: ConfigurationTarget[];
};

type LifecycleOperation = Extract<
  ConfigurationChange["operations"][number],
  { operation: "delete" | "restore" | "deletePermanently" }
>;

export const targetKey = (target: ConfigurationTarget) => `${target.kind}:${target.id}`;

export function isLifecycleOperation(
  operation: ConfigurationChange["operations"][number],
): operation is LifecycleOperation {
  return (
    operation.operation === "delete" || operation.operation === "restore" || operation.operation === "deletePermanently"
  );
}

export function deletionReference(model: RecordModel, target: ConfigurationTarget): DeletionReference {
  const typeLabel = (id: string) => model.types.find((type) => type.id === id)?.pluralLabel ?? "";
  if (target.kind === "type") return { kind: "type", id: target.id, label: typeLabel(target.id) };
  if (target.kind === "field") {
    const field = model.fields.find((candidate) => candidate.id === target.id);
    return { kind: "field", id: target.id, typeId: field?.typeId, label: field?.label ?? "" };
  }
  const relation = model.relationships.find((candidate) => candidate.id === target.id);
  return {
    kind: "relationship",
    id: target.id,
    typeId: relation?.sourceTypeId,
    label: relation ? `${typeLabel(relation.sourceTypeId)} → ${typeLabel(relation.targetTypeId)}` : "",
  };
}

function invalid(): never {
  throw new RecordWriteError(CustomErrorCode.recordConfigurationInvalid);
}

function isDeleted(model: RecordModel, target: ConfigurationTarget): boolean {
  if (target.kind === "type") return model.types.find((type) => type.id === target.id)?.archived ?? invalid();
  if (target.kind === "field") return model.fields.find((field) => field.id === target.id)?.archived ?? invalid();
  return model.relationships.find((relation) => relation.id === target.id)?.archived ?? invalid();
}

function setDeleted(model: RecordModel, target: ConfigurationTarget, archived: boolean) {
  const items: Array<{ id: string; archived: boolean }> =
    target.kind === "type" ? model.types : target.kind === "field" ? model.fields : model.relationships;
  const index = items.findIndex((item) => item.id === target.id);
  if (index < 0) invalid();
  items[index] = { ...items[index], archived };
}

function activeType(model: RecordModel, id: string): boolean {
  return model.types.some((type) => type.id === id && !type.archived);
}

function deleteWithCascade(model: RecordModel, target: ConfigurationTarget): ConfigurationTarget[] {
  const cascade: ConfigurationTarget[] = [];
  const remove = (item: ConfigurationTarget) => {
    if (isDeleted(model, item)) return;
    setDeleted(model, item, true);
    cascade.push(item);
  };
  const removeType = (typeId: string) => {
    for (const relation of model.relationships) {
      if (relation.sourceTypeId === typeId || relation.targetTypeId === typeId)
        remove({ kind: "relationship", id: relation.id });
    }
    for (const child of model.types) {
      const parent = model.relationships.find((relation) => relation.id === child.parentRelationshipId);
      if (child.embedded && parent?.targetTypeId === typeId && child.id !== typeId) {
        remove({ kind: "type", id: child.id });
        removeType(child.id);
      }
    }
  };
  setDeleted(model, target, true);
  if (target.kind === "type") removeType(target.id);
  return cascade.filter((item) => targetKey(item) !== targetKey(target));
}

function canRestore(model: RecordModel, target: ConfigurationTarget): boolean {
  if (target.kind === "type") {
    const type = model.types.find((candidate) => candidate.id === target.id);
    const parent = model.relationships.find((relation) => relation.id === type?.parentRelationshipId);
    return !type?.embedded || !parent || activeType(model, parent.targetTypeId);
  }
  if (target.kind === "field") {
    const field = model.fields.find((candidate) => candidate.id === target.id);
    return Boolean(field && activeType(model, field.typeId));
  }
  const relation = model.relationships.find((candidate) => candidate.id === target.id);
  return Boolean(relation && activeType(model, relation.sourceTypeId) && activeType(model, relation.targetTypeId));
}

function restoreBlocker(model: RecordModel, target: ConfigurationTarget): DeletionBlocker {
  const field = target.kind === "field" ? model.fields.find((candidate) => candidate.id === target.id) : undefined;
  const relation =
    target.kind === "relationship" ? model.relationships.find((candidate) => candidate.id === target.id) : undefined;
  const type = model.types.find((candidate) => candidate.id === target.id);
  const parent = model.relationships.find((candidate) => candidate.id === type?.parentRelationshipId);
  const missingType = [field?.typeId, relation?.sourceTypeId, relation?.targetTypeId, parent?.targetTypeId].find(
    (id): id is string => Boolean(id) && !activeType(model, id as string),
  );
  return {
    reason: "requiresRestore",
    source: deletionReference(model, target),
    target: missingType
      ? deletionReference(model, { kind: "type", id: missingType })
      : deletionReference(model, { kind: "relationship", id: target.id }),
  };
}

function dependencyBlockers(
  model: RecordModel,
  removed: { typeIds: Set<string>; fieldIds: Set<string>; relationIds: Set<string> },
  reference: (target: ConfigurationTarget) => DeletionReference,
  includeDeleted: boolean,
): DeletionBlocker[] {
  const blockers: DeletionBlocker[] = [];
  const live = (typeId: string) => !removed.typeIds.has(typeId) && (includeDeleted || activeType(model, typeId));
  for (const field of model.fields) {
    if (removed.fieldIds.has(field.id) || !live(field.typeId) || (!includeDeleted && field.archived)) continue;
    if (field.behavior.kind === "input") continue;
    const fieldId = [...expressionFieldDependencies(field.behavior.expression)].find((id) => removed.fieldIds.has(id));
    const relationId = [...expressionRelationshipDependencies(field.behavior.expression)].find((id) =>
      removed.relationIds.has(id),
    );
    const source = reference({ kind: "field", id: field.id });
    if (fieldId) blockers.push({ reason: "calculation", source, target: reference({ kind: "field", id: fieldId }) });
    else if (relationId)
      blockers.push({ reason: "calculation", source, target: reference({ kind: "relationship", id: relationId }) });
    else if (
      field.behavior.kind === "snapshot" &&
      field.behavior.triggerFieldId &&
      removed.fieldIds.has(field.behavior.triggerFieldId)
    ) {
      blockers.push({
        reason: "snapshotTrigger",
        source,
        target: reference({ kind: "field", id: field.behavior.triggerFieldId }),
      });
    }
  }
  for (const type of model.types) {
    if (!live(type.id)) continue;
    if (type.parentRelationshipId && removed.relationIds.has(type.parentRelationshipId)) {
      blockers.push({
        reason: "parentAccess",
        source: reference({ kind: "type", id: type.id }),
        target: reference({ kind: "relationship", id: type.parentRelationshipId }),
      });
    }
  }
  for (const binding of model.capabilities) {
    if (removed.typeIds.has(binding.typeId)) {
      if (binding.kind === "membershipAuthorization") {
        blockers.push({
          reason: "protected",
          source: reference({ kind: "type", id: binding.typeId }),
          target: reference({ kind: "type", id: binding.typeId }),
        });
      }
      continue;
    }
    const field = binding.fields.find((entry) => removed.fieldIds.has(entry.fieldId));
    if (field && live(binding.typeId)) {
      blockers.push({
        reason: "binding",
        source: reference({ kind: "type", id: binding.typeId }),
        target: reference({ kind: "field", id: field.fieldId }),
      });
    }
  }
  return blockers;
}

function cleanListDefaults(
  model: RecordModel,
  removed: { fieldIds: Set<string>; relationIds: Set<string> },
  reference: (target: ConfigurationTarget) => DeletionReference,
  cause: DeletionReference,
): DeletionCleanup[] {
  const cleaned: DeletionCleanup[] = [];
  model.types = model.types.map((type): RecordType => {
    if (type.archived) return type;
    const pathIds = new Set(
      (type.relationshipPaths ?? [])
        .filter((path) => path.path.some((step) => removed.relationIds.has(step.relationId)))
        .map((path) => path.id),
    );
    const stale = (id: string | null | undefined) => {
      if (!id) return false;
      if (removed.fieldIds.has(id)) return true;
      if (id.startsWith("relationship:")) return removed.relationIds.has(id.split(":")[1]);
      if (id.startsWith("path:")) return pathIds.has(id.slice("path:".length));
      return false;
    };
    const keep = (ids: string[]) => ids.filter((id) => !stale(id));
    const grouped = stale(type.defaults.groupBy);
    const defaults = {
      ...type.defaults,
      columns: keep(type.defaults.columns),
      hiddenColumns: keep(type.defaults.hiddenColumns),
      pinnedFields: keep(type.defaults.pinnedFields),
      sortField: stale(type.defaults.sortField) ? null : type.defaults.sortField,
      ...(grouped ? { groupBy: null, groupBucket: undefined } : {}),
      ...(type.defaults.groupSummaries
        ? { groupSummaries: type.defaults.groupSummaries.filter((summary) => !stale(summary.fieldId)) }
        : {}),
    };
    if (JSON.stringify(defaults) === JSON.stringify(type.defaults) && !pathIds.size) return type;
    cleaned.push({ consumer: reference({ kind: "type", id: type.id }), target: cause });
    return {
      ...type,
      defaults,
      ...(pathIds.size ? { relationshipPaths: type.relationshipPaths?.filter((path) => !pathIds.has(path.id)) } : {}),
    };
  });
  return cleaned;
}

function removePermanently(
  model: RecordModel,
  targets: ConfigurationTarget[],
): {
  removed: RecordDefinitionDeletion;
  sets: { typeIds: Set<string>; fieldIds: Set<string>; relationIds: Set<string> };
} {
  const typeIds = new Set(targets.filter((target) => target.kind === "type").map((target) => target.id));
  const fieldIds = new Set(targets.filter((target) => target.kind === "field").map((target) => target.id));
  const relationIds = new Set(targets.filter((target) => target.kind === "relationship").map((target) => target.id));
  for (const field of model.fields) if (typeIds.has(field.typeId)) fieldIds.add(field.id);
  const channelTypeIds = new Set(
    model.fields
      .filter((field) => field.valueType === "channels" && fieldIds.has(field.id) && !typeIds.has(field.typeId))
      .map((field) => field.typeId),
  );
  for (const relation of model.relationships)
    if (typeIds.has(relation.sourceTypeId) || typeIds.has(relation.targetTypeId)) relationIds.add(relation.id);
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
  model.capabilities = model.capabilities.filter((binding) => !typeIds.has(binding.typeId));
  return {
    removed: {
      typeIds: [...typeIds],
      fieldIds: [...fieldIds],
      relationIds: [...relationIds],
      channelTypeIds: [...channelTypeIds],
    },
    sets: { typeIds, fieldIds, relationIds },
  };
}

export function applyConfigurationLifecycle(
  model: RecordModel,
  operations: ConfigurationChange["operations"],
  records: Map<string, ConfigurationDeletionRecord>,
): ConfigurationLifecycle {
  if (!operations.every(isLifecycleOperation)) invalid();
  const before = structuredClone(model);
  const reference = (target: ConfigurationTarget) => deletionReference(before, target);
  const deletions: ConfigurationDeletion[] = [];
  const blockers: DeletionBlocker[] = [];
  const cleaned: DeletionCleanup[] = [];
  const permanent: ConfigurationTarget[] = [];
  for (const operation of operations) {
    const target = operation.target;
    const deleted = isDeleted(model, target);
    if (operation.operation === "delete") {
      if (deleted) invalid();
      if (target.kind === "field") {
        const field = model.fields.find((candidate) => candidate.id === target.id);
        if (!field || !activeType(model, field.typeId)) invalid();
        if (model.types.some((type) => type.primaryFieldId === target.id)) {
          blockers.push({
            reason: "primaryField",
            source: reference({ kind: "type", id: field.typeId }),
            target: reference(target),
          });
        }
      }
      deletions.push({ target, cascade: deleteWithCascade(model, target) });
    } else if (operation.operation === "restore") {
      if (!deleted) invalid();
      if (!canRestore(model, target)) {
        blockers.push(restoreBlocker(model, target));
        continue;
      }
      setDeleted(model, target, false);
      const cascade = records.get(targetKey(target))?.cascade ?? [];
      for (const kind of ["type", "relationship", "field"] as const) {
        for (const item of cascade.filter((entry) => entry.kind === kind))
          if (isDeleted(model, item) && canRestore(model, item)) setDeleted(model, item, false);
      }
    } else {
      if (!deleted) invalid();
      permanent.push(
        target,
        ...(records.get(targetKey(target))?.cascade ?? []).filter((item) => isDeleted(model, item)),
      );
    }
  }
  if (operations.some((operation) => operation.operation === "restore")) {
    cleanListDefaults(
      model,
      {
        fieldIds: new Set(model.fields.filter((field) => field.archived).map((field) => field.id)),
        relationIds: new Set(
          model.relationships.filter((relation) => relation.archived).map((relation) => relation.id),
        ),
      },
      reference,
      reference(operations[0].target),
    );
  }
  const softDeleted = deletions.flatMap((deletion) => [deletion.target, ...deletion.cascade]);
  if (softDeleted.length) {
    const sets = {
      typeIds: new Set(softDeleted.filter((item) => item.kind === "type").map((item) => item.id)),
      fieldIds: new Set(softDeleted.filter((item) => item.kind === "field").map((item) => item.id)),
      relationIds: new Set(softDeleted.filter((item) => item.kind === "relationship").map((item) => item.id)),
    };
    for (const field of before.fields) if (sets.typeIds.has(field.typeId)) sets.fieldIds.add(field.id);
    blockers.push(...dependencyBlockers(before, sets, reference, false));
    cleaned.push(...cleanListDefaults(model, sets, reference, reference(deletions[0].target)));
  }
  let removed: RecordDefinitionDeletion | null = null;
  if (permanent.length) {
    const result = removePermanently(model, permanent);
    removed = result.removed;
    blockers.push(...dependencyBlockers(model, result.sets, reference, true));
  }
  return {
    deletions,
    removed,
    blockers: blockers.filter(
      (blocker, index) =>
        blockers.findIndex(
          (other) =>
            other.reason === blocker.reason &&
            other.source.id === blocker.source.id &&
            other.target.id === blocker.target.id,
        ) === index,
    ),
    cleaned,
    deletedTargets: softDeleted,
  };
}
