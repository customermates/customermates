import type { RecordModel } from "./record-model.schema";
import type { ModelIssue } from "./record-model-validation";

export function recordNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function listNameIssues(model: RecordModel, previous: RecordModel): ModelIssue[] {
  const active = model.types.filter((type) => !type.archived);
  return active.flatMap((type) => {
    const before = previous.types.find((candidate) => candidate.id === type.id);
    if (before && !before.archived && before.label === type.label && before.pluralLabel === type.pluralLabel) return [];
    const keys = new Set([recordNameKey(type.label), recordNameKey(type.pluralLabel)]);
    const clash = active.some(
      (other) =>
        other.id !== type.id && (keys.has(recordNameKey(other.label)) || keys.has(recordNameKey(other.pluralLabel))),
    );
    return clash ? [{ code: "duplicate_list_name", typeId: type.id }] : [];
  });
}

function fieldNameIssues(model: RecordModel, previous: RecordModel): ModelIssue[] {
  return model.fields.flatMap((field) => {
    const before = previous.fields.find((candidate) => candidate.id === field.id);
    const issues: ModelIssue[] = [];
    if (!before || before.label !== field.label || before.archived !== field.archived) {
      const key = recordNameKey(field.label);
      if (
        model.fields.some(
          (other) => other.id !== field.id && other.typeId === field.typeId && recordNameKey(other.label) === key,
        )
      )
        issues.push({ code: "duplicate_field_name", fieldId: field.id, typeId: field.typeId });
    }
    const optionKeys = field.options.map((option) => recordNameKey(option.label));
    const changedOptions = field.options.some(
      (option) => before?.options.find((candidate) => candidate.id === option.id)?.label !== option.label,
    );
    if (changedOptions && new Set(optionKeys).size !== optionKeys.length)
      issues.push({ code: "duplicate_option_label", fieldId: field.id, typeId: field.typeId });
    return issues;
  });
}

function relationshipLabelIssues(model: RecordModel, previous: RecordModel): ModelIssue[] {
  const active = model.relationships.filter((relation) => !relation.archived);
  const ends = active.flatMap((relation) => [
    { relationId: relation.id, typeId: relation.sourceTypeId, key: recordNameKey(relation.sourceLabel) },
    { relationId: relation.id, typeId: relation.targetTypeId, key: recordNameKey(relation.targetLabel) },
  ]);
  return active.flatMap((relation) => {
    const before = previous.relationships.find((candidate) => candidate.id === relation.id);
    if (
      before &&
      !before.archived &&
      before.sourceLabel === relation.sourceLabel &&
      before.targetLabel === relation.targetLabel &&
      before.sourceTypeId === relation.sourceTypeId &&
      before.targetTypeId === relation.targetTypeId
    )
      return [];
    const clash = ends.some(
      (end) =>
        end.relationId !== relation.id &&
        ((end.typeId === relation.sourceTypeId && end.key === recordNameKey(relation.sourceLabel)) ||
          (end.typeId === relation.targetTypeId && end.key === recordNameKey(relation.targetLabel))),
    );
    return clash ? [{ code: "duplicate_relationship_label", relationId: relation.id }] : [];
  });
}

export function duplicateNameIssues(model: RecordModel, previous: RecordModel): ModelIssue[] {
  return [
    ...listNameIssues(model, previous),
    ...fieldNameIssues(model, previous),
    ...relationshipLabelIssues(model, previous),
  ];
}
