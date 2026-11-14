import type { RecordField } from "@/features/records/record-model.schema";
import type { PublicFormConfig, PublicFormView } from "./public-form.schema";

import { isFormEligibleField, isFormFieldValueType } from "./public-form-fields";

type PresentArgs = {
  config: PublicFormConfig;
  typeId: string;
  modelFields: readonly RecordField[];
  workspaceName: string | null;
  badge: boolean;
  renderToken: string;
};

export function presentPublicForm({
  config,
  typeId,
  modelFields,
  workspaceName,
  badge,
  renderToken,
}: PresentArgs): PublicFormView {
  const fields = config.fields.flatMap((entry) => {
    const field = modelFields.find(
      (candidate) => candidate.id === entry.fieldId && candidate.typeId === typeId && isFormEligibleField(candidate),
    );
    if (!field || !isFormFieldValueType(field.valueType)) return [];
    return [
      {
        fieldId: entry.fieldId,
        label: entry.label,
        helpText: entry.helpText,
        required: entry.required || field.required,
        valueType: field.valueType,
        multiple: field.multiple === true,
        options: field.options.map((option) => ({ id: option.id, label: option.label })),
        currency: field.valueType === "currency" ? (field.format?.currency ?? null) : null,
      },
    ];
  });

  return {
    title: config.title,
    description: config.description,
    submitLabel: config.submitLabel,
    workspaceName,
    locale: config.locale,
    fields,
    person: config.person ? { emailLabel: config.person.emailLabel, nameLabel: config.person.nameLabel } : null,
    consent: config.consent,
    badge,
    renderToken,
  };
}
