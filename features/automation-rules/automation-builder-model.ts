import type { RecordModelView } from "@/features/records/record-model.schema";

export type AutomationBuilderField = {
  id: string;
  label: string;
  valueType: string;
  writable: boolean;
  multiple: boolean;
  currency: string | null;
  options: { id: string; label: string }[];
};

export type AutomationBuilderRelationship = {
  id: string;
  sourceTypeId: string;
  targetTypeId: string;
  sourceLabel: string;
  targetLabel: string;
};

export type AutomationBuilderList = {
  id: string;
  label: string;
  primaryFieldId: string | null;
  fields: AutomationBuilderField[];
};

export type AutomationBuilderModel = {
  lists: AutomationBuilderList[];
  relationships: AutomationBuilderRelationship[];
};

const SKIPPED_TYPES = new Set(["channels", "file", "richText", "address", "dateRange", "dateTimeRange"]);

export function toAutomationBuilderModel(model: RecordModelView): AutomationBuilderModel {
  const lists = model.types
    .filter((type) => !type.archived && !type.embedded)
    .sort((left, right) => left.position - right.position)
    .map((type) => ({
      id: type.id,
      label: type.label,
      primaryFieldId: type.primaryFieldId,
      fields: model.fields
        .filter((field) => field.typeId === type.id && !field.archived && !SKIPPED_TYPES.has(field.valueType))
        .sort((left, right) => left.position - right.position)
        .map((field) => ({
          id: field.id,
          label: field.label,
          valueType: field.valueType,
          writable: field.behavior.kind === "input",
          multiple: field.multiple === true,
          currency: field.format?.currency ?? null,
          options: field.options.map((option) => ({ id: option.id, label: option.label })),
        })),
    }));
  const listIds = new Set(lists.map((list) => list.id));
  return {
    lists,
    relationships: model.relationships
      .filter((relation) => !relation.archived && listIds.has(relation.sourceTypeId) && listIds.has(relation.targetTypeId))
      .map((relation) => ({
        id: relation.id,
        sourceTypeId: relation.sourceTypeId,
        targetTypeId: relation.targetTypeId,
        sourceLabel: relation.sourceLabel,
        targetLabel: relation.targetLabel,
      })),
  };
}
