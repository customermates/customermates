import type { RecordModel } from "@/features/records/record-model.schema";
import type { FormPeopleListOption, FormFieldOption, PublicFormConfig } from "./public-form.schema";

import { recordChannelsEnabled } from "@/features/records/record-channels";

import { isFormEligibleField, isFormFieldValueType } from "./public-form-fields";

export function formFieldOptions(model: RecordModel, typeId: string): FormFieldOption[] {
  return model.fields
    .filter((field) => field.typeId === typeId && isFormEligibleField(field))
    .sort((left, right) => left.position - right.position)
    .flatMap((field) =>
      isFormFieldValueType(field.valueType)
        ? [
            {
              fieldId: field.id,
              label: field.label,
              valueType: field.valueType,
              required: field.required,
              multiple: field.multiple === true,
              options: field.options.map((option) => ({ id: option.id, label: option.label })),
            },
          ]
        : [],
    );
}

export function formPeopleLists(model: RecordModel, typeId: string): FormPeopleListOption[] {
  return model.types
    .filter((type) => !type.archived && type.id !== typeId && recordChannelsEnabled(model, type.id))
    .flatMap((type) => {
      const relationships = model.relationships
        .filter(
          (relation) =>
            !relation.archived &&
            ((relation.sourceTypeId === typeId && relation.targetTypeId === type.id) ||
              (relation.targetTypeId === typeId && relation.sourceTypeId === type.id)),
        )
        .map((relation) => ({ id: relation.id, sourceLabel: relation.sourceLabel, targetLabel: relation.targetLabel }));
      if (relationships.length === 0) return [];
      const nameFields = model.fields
        .filter(
          (field) =>
            field.typeId === type.id &&
            !field.archived &&
            field.valueType === "text" &&
            !field.multiple &&
            field.behavior.kind === "input",
        )
        .sort((left, right) => left.position - right.position)
        .map((field) => ({ fieldId: field.id, label: field.label, primary: field.id === type.primaryFieldId }));
      return [{ typeId: type.id, label: type.pluralLabel, relationships, nameFields }];
    });
}

export function invalidFormConfigPaths(config: PublicFormConfig, model: RecordModel, typeId: string): string[] {
  const issues: string[] = [];
  const eligible = new Set(formFieldOptions(model, typeId).map((field) => field.fieldId));
  config.fields.forEach((field, index) => {
    if (!eligible.has(field.fieldId)) issues.push(`config.fields.${index}.fieldId`);
  });
  const { person } = config;
  if (!person) return issues;
  const people = formPeopleLists(model, typeId).find((entry) => entry.typeId === person.typeId);
  if (!people) return [...issues, "config.person.typeId"];
  if (!people.relationships.some((relation) => relation.id === person.relationshipId))
    issues.push("config.person.relationshipId");
  if (person.nameFieldId && !people.nameFields.some((field) => field.fieldId === person.nameFieldId))
    issues.push("config.person.nameFieldId");
  return issues;
}
