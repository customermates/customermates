import type { RecordField, RecordModel } from "@/features/records/record-model.schema";
import type { FormPeopleListOption, FormFieldOption, PublicFormConfig } from "./public-form.schema";

import { recordChannelsEnabled } from "@/features/records/record-channels";
import { isAnswerableField, isAnswerableValueType } from "@/features/records/record-value-coercion";

function needsAnAnswer(field: RecordField): boolean {
  return (
    !field.archived &&
    field.required &&
    field.valueType !== "channels" &&
    field.behavior.kind === "input" &&
    (field.behavior.defaultValue ?? null) === null
  );
}

export function formFieldOptions(model: RecordModel, typeId: string): FormFieldOption[] {
  return model.fields
    .filter((field) => field.typeId === typeId && isAnswerableField(field))
    .sort((left, right) => left.position - right.position)
    .flatMap((field) =>
      isAnswerableValueType(field.valueType)
        ? [
            {
              fieldId: field.id,
              label: field.label,
              valueType: field.valueType,
              required: field.required,
              mustInclude: needsAnAnswer(field),
              multiple: field.multiple === true,
              options: field.options.map((option) => ({ id: option.id, label: option.label })),
            },
          ]
        : [],
    );
}

export function formBlockingFields(model: RecordModel, typeId: string): string[] {
  return model.fields
    .filter((field) => field.typeId === typeId && needsAnAnswer(field) && !isAnswerableField(field))
    .sort((left, right) => left.position - right.position)
    .map((field) => field.label);
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

function requiredFieldPaths(config: PublicFormConfig, model: RecordModel, typeId: string): string[] {
  const asked = new Set(config.fields.map((field) => field.fieldId));
  const missing = formFieldOptions(model, typeId).some((field) => field.mustInclude && !asked.has(field.fieldId));
  return missing || formBlockingFields(model, typeId).length > 0 ? ["config.fields"] : [];
}

function personPaths(config: PublicFormConfig, model: RecordModel, typeId: string): string[] {
  const { person } = config;
  if (!person) return [];
  const people = formPeopleLists(model, typeId).find((entry) => entry.typeId === person.typeId);
  if (!people) return ["config.person.typeId"];
  const issues: string[] = [];
  if (!people.relationships.some((relation) => relation.id === person.relationshipId))
    issues.push("config.person.relationshipId");
  if (person.nameFieldId && !people.nameFields.some((field) => field.fieldId === person.nameFieldId))
    issues.push("config.person.nameFieldId");
  return issues;
}

export function formCannotSaveRecords(config: PublicFormConfig, model: RecordModel, typeId: string): boolean {
  return requiredFieldPaths(config, model, typeId).length > 0 || personPaths(config, model, typeId).length > 0;
}

export function invalidFormConfigPaths(config: PublicFormConfig, model: RecordModel, typeId: string): string[] {
  const eligible = new Set(formFieldOptions(model, typeId).map((field) => field.fieldId));
  const unknown = config.fields.flatMap((field, index) =>
    eligible.has(field.fieldId) ? [] : [`config.fields.${index}.fieldId`],
  );
  return [...unknown, ...requiredFieldPaths(config, model, typeId), ...personPaths(config, model, typeId)];
}
