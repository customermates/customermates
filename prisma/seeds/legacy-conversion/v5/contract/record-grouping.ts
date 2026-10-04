import type { Grouping } from "./grouping.schema";
import type { RecordField, RecordModel, RecordRelationship } from "./record-model.schema";

import { DEFAULT_DATE_BUCKET } from "./grouping.schema";
import { parseRelationshipColumnKey, parseRelationshipPathColumnKey } from "./record-column.schema";
import { resolveRecordPath } from "./record-relationship-path";
import type { RecordPathStep } from "./record-relationship-path.schema";

export type RecordGroupingSource =
  | { kind: "field"; field: RecordField }
  | { kind: "system"; field: "system:assignedTo" | "system:createdAt" | "system:updatedAt" }
  | { kind: "relationshipPath"; path: RecordPathStep[]; targetTypeId: string }
  | { kind: "relationship"; relation: RecordRelationship; direction: "incoming" | "outgoing" };

export function resolveRecordGrouping(
  typeId: string,
  grouping: Grouping,
  model: RecordModel,
): {
  source: RecordGroupingSource;
  grouping: Grouping;
  kind: "relation" | "dateBucket" | "customSingleSelect" | "enum";
} | null {
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
