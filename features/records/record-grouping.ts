import type { GroupableFieldDto } from "@/core/base/grouping/groupable-field";
import type { Grouping } from "@/core/base/grouping/grouping.schema";
import type { RecordField, RecordRelationship, RecordModelView, RecordFieldView } from "./record-model.schema";

import { DATE_BUCKETS, DEFAULT_DATE_BUCKET } from "@/core/base/grouping/grouping.schema";
import { parseRelationshipColumnKey, parseRelationshipPathColumnKey } from "./record-column.schema";
import { recordColumns } from "./record-columns";
import { resolveRecordPath } from "./record-relationship-path";
import type { RecordPathStep } from "./record-relationship-path.schema";

export type RecordGroupingSource<F extends RecordFieldView = RecordField> =
  | { kind: "field"; field: F }
  | { kind: "system"; field: "system:assignedTo" | "system:createdAt" | "system:updatedAt" }
  | { kind: "relationshipPath"; path: RecordPathStep[]; targetTypeId: string }
  | { kind: "relationship"; relation: RecordRelationship; direction: "incoming" | "outgoing" };

export function resolveRecordGrouping<F extends RecordFieldView = RecordField>(
  typeId: string,
  grouping: Grouping,
  model: Omit<RecordModelView, "fields"> & { fields: F[] },
): { source: RecordGroupingSource<F>; grouping: Grouping; kind: GroupableFieldDto["kind"] } | null {
  const pathId = parseRelationshipPathColumnKey(grouping.field);
  if (pathId) {
    const definition = model.types
      .find((type) => type.id === typeId)
      ?.relationshipPaths?.find((path) => path.id === pathId && !path.archived);
    const steps = definition && resolveRecordPath(typeId, definition.path, model);
    const targetTypeId = steps?.at(-1)?.typeId;
    return definition && targetTypeId && !grouping.bucket
      ? { source: { kind: "relationshipPath", path: definition.path, targetTypeId }, grouping, kind: "relation" }
      : null;
  }
  const relationship = parseRelationshipColumnKey(grouping.field);
  if (relationship) {
    const relation = model.relationships.find(
      (relation) => relation.id === relationship.relationId && !relation.archived,
    );
    if (
      !relation ||
      grouping.bucket ||
      (relationship.direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) !== typeId
    )
      return null;
    return {
      source: { kind: "relationship", relation, direction: relationship.direction },
      grouping,
      kind: "relation",
    };
  }
  if (grouping.field === "system:assignedTo")
    return grouping.bucket ? null : { source: { kind: "system", field: grouping.field }, grouping, kind: "relation" };
  if (grouping.field === "system:createdAt" || grouping.field === "system:updatedAt") {
    return {
      source: { kind: "system", field: grouping.field },
      grouping: { ...grouping, bucket: grouping.bucket ?? DEFAULT_DATE_BUCKET },
      kind: "dateBucket",
    };
  }
  const field = model.fields.find((field) => field.typeId === typeId && field.id === grouping.field && !field.archived);
  if (!field || field.multiple) return null;
  if (["date", "dateTime", "dateRange", "dateTimeRange"].includes(field.valueType)) {
    return {
      source: { kind: "field", field },
      grouping: { ...grouping, bucket: grouping.bucket ?? DEFAULT_DATE_BUCKET },
      kind: "dateBucket",
    };
  }
  if (grouping.bucket) return null;
  const kind =
    field.valueType === "select"
      ? "customSingleSelect"
      : field.valueType === "boolean"
        ? "enum"
        : field.valueType === "member"
          ? "relation"
          : null;
  return kind ? { source: { kind: "field", field }, grouping, kind } : null;
}

export function recordGroupableFields(typeId: string, model: RecordModelView, canUpdate = false): GroupableFieldDto[] {
  return recordColumns(typeId, model).flatMap((column) => {
    const resolved = resolveRecordGrouping(typeId, { field: column.id }, model);
    if (!resolved) return [];
    const common = {
      label: column.label,
      kind: resolved.kind,
      supportsDragWriteBack:
        canUpdate &&
        resolved.source.kind === "field" &&
        resolved.source.field.valueType === "select" &&
        resolved.source.field.behavior.kind === "input",
    };
    return resolved.kind === "dateBucket"
      ? DATE_BUCKETS.map((bucket) => ({
          ...common,
          id: `${column.id}:${bucket}`,
          grouping: { field: column.id, bucket },
          bucket,
        }))
      : [{ ...common, id: column.id, grouping: resolved.grouping }];
  });
}
