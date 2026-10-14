import type { RecordModel, RecordRelationship } from "./record-model.schema";
import type { RecordPathStep } from "./record-relationship-path.schema";

export function resolveRecordPath(
  typeId: string,
  path: RecordPathStep[],
  model: Pick<RecordModel, "relationships">,
): Array<RecordPathStep & { relation: RecordRelationship; typeId: string }> | null {
  if (!path.length || path.length > 6) return null;
  const result = [];
  for (const step of path) {
    const relation = model.relationships.find((candidate) => candidate.id === step.relationId && !candidate.archived);
    const outgoing = step.direction === "outgoing";
    if (!relation || (outgoing ? relation.sourceTypeId : relation.targetTypeId) !== typeId) return null;
    typeId = outgoing ? relation.targetTypeId : relation.sourceTypeId;
    result.push({ ...step, relation, typeId });
  }
  return result;
}
