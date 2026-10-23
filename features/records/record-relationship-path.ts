import type { RecordModel, RecordRelationship } from "./record-model.schema";
import type { RecordPathStep, RecordRelationshipPath } from "./record-relationship-path.schema";

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

export function recordFilterPaths(
  typeId: string,
  model: Pick<RecordModel, "types" | "relationships">,
  own: RecordRelationshipPath[] = model.types.find((type) => type.id === typeId)?.relationshipPaths ?? [],
): Array<RecordRelationshipPath & { sourceTypeId?: string }> {
  const reversed = model.types.flatMap((owner) =>
    owner.archived || owner.id === typeId
      ? []
      : (owner.relationshipPaths ?? []).flatMap((path) => {
          const steps = path.archived ? null : resolveRecordPath(owner.id, path.path, model);
          if (steps?.at(-1)?.typeId !== typeId) return [];
          return [
            {
              ...path,
              label: owner.label,
              sourceTypeId: owner.id,
              path: steps.toReversed().map((step) => ({
                relationId: step.relationId,
                direction: step.direction === "outgoing" ? ("incoming" as const) : ("outgoing" as const),
              })),
            },
          ];
        }),
  );
  return [...own, ...reversed];
}
