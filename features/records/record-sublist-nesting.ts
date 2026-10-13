import type { RecordModel } from "./record-model.schema";
import type { ModelIssue } from "./record-model-validation";

function nestedUnderSublist(model: RecordModel, typeId: string): boolean {
  const type = model.types.find((candidate) => candidate.id === typeId);
  if (!type || type.archived || !type.parentRelationshipId) return false;
  const relation = model.relationships.find((candidate) => candidate.id === type.parentRelationshipId);
  const parent = relation && model.types.find((candidate) => candidate.id === relation.targetTypeId);
  return Boolean(parent && (parent.embedded || parent.parentRelationshipId));
}

export function nestedSublistIssues(model: RecordModel, previous: RecordModel): ModelIssue[] {
  return model.types
    .filter((type) => nestedUnderSublist(model, type.id) && !nestedUnderSublist(previous, type.id))
    .map((type) => ({ code: "nested_sublist", typeId: type.id }));
}
