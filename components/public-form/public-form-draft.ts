import type { PublicFormConfig, PublicFormEditor, PublicFormView } from "@/features/public-form/public-form.schema";

import { PublicFormConfigSchema } from "@/features/public-form/public-form.schema";

export type DraftField = {
  fieldId: string;
  included: boolean;
  label: string;
  helpText: string;
  required: boolean;
};

export type FormDraft = {
  title: string;
  description: string;
  submitLabel: string;
  fields: DraftField[];
  personEnabled: boolean;
  personTypeId: string;
  personRelationshipId: string;
  personNameFieldId: string;
  emailLabel: string;
  nameLabel: string;
  consentEnabled: boolean;
  consentText: string;
  privacyUrl: string;
  successMessage: string;
  redirectUrl: string;
  locale: string;
  enabled: boolean;
};

export type DraftTexts = {
  submitLabel: string;
  successMessage: string;
  emailLabel: string;
  nameLabel: string;
};

const DEFAULT_INCLUDED_FIELDS = 5;

function nullable(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function initialDraft(editor: PublicFormEditor, texts: DraftTexts): FormDraft {
  const config = editor.form?.config ?? null;
  const known = new Map(config?.fields.map((field) => [field.fieldId, field]) ?? []);
  const firstPeople = editor.peopleLists[0];
  const person = config?.person ?? null;
  const fields = editor.fields.map((field, index) => {
    const stored = known.get(field.fieldId);
    return {
      fieldId: field.fieldId,
      included: config ? Boolean(stored) : field.required || index < DEFAULT_INCLUDED_FIELDS,
      label: stored?.label ?? field.label,
      helpText: stored?.helpText ?? "",
      required: stored?.required ?? field.required,
    };
  });
  const ordered = config
    ? [...fields].sort((left, right) => {
        const leftAt = config.fields.findIndex((field) => field.fieldId === left.fieldId);
        const rightAt = config.fields.findIndex((field) => field.fieldId === right.fieldId);
        return (leftAt < 0 ? Number.MAX_SAFE_INTEGER : leftAt) - (rightAt < 0 ? Number.MAX_SAFE_INTEGER : rightAt);
      })
    : fields;

  return {
    title: config?.title ?? editor.typeLabel,
    description: config?.description ?? "",
    submitLabel: config?.submitLabel ?? texts.submitLabel,
    fields: ordered,
    personEnabled: person !== null,
    personTypeId: person?.typeId ?? firstPeople?.typeId ?? "",
    personRelationshipId: person?.relationshipId ?? firstPeople?.relationships[0]?.id ?? "",
    personNameFieldId:
      person?.nameFieldId ?? firstPeople?.nameFields.find((field) => field.primary)?.fieldId ?? firstPeople?.nameFields[0]?.fieldId ?? "",
    emailLabel: person?.emailLabel ?? texts.emailLabel,
    nameLabel: person?.nameLabel ?? texts.nameLabel,
    consentEnabled: config !== null && config.consent !== null,
    consentText: config?.consent?.text ?? "",
    privacyUrl: config?.consent?.privacyUrl ?? "",
    successMessage: config?.success.message ?? texts.successMessage,
    redirectUrl: config?.success.redirectUrl ?? "",
    locale: config?.locale ?? "",
    enabled: editor.form?.enabled ?? true,
  };
}

export function configFromDraft(draft: FormDraft): unknown {
  return {
    title: draft.title.trim(),
    description: nullable(draft.description),
    submitLabel: draft.submitLabel.trim(),
    fields: draft.fields
      .filter((field) => field.included)
      .map((field) => ({
        fieldId: field.fieldId,
        label: field.label.trim(),
        helpText: nullable(field.helpText),
        required: field.required,
      })),
    person: draft.personEnabled
      ? {
          typeId: draft.personTypeId,
          relationshipId: draft.personRelationshipId,
          emailLabel: draft.emailLabel.trim(),
          nameLabel: nullable(draft.nameLabel),
          nameFieldId: nullable(draft.personNameFieldId),
        }
      : null,
    consent: draft.consentEnabled ? { text: draft.consentText.trim(), privacyUrl: draft.privacyUrl.trim() } : null,
    success: { message: draft.successMessage.trim(), redirectUrl: nullable(draft.redirectUrl) },
    locale: nullable(draft.locale),
  };
}

export function validDraftConfig(draft: FormDraft): PublicFormConfig | null {
  const parsed = PublicFormConfigSchema.safeParse(configFromDraft(draft));
  return parsed.success ? parsed.data : null;
}

export function previewForm(draft: FormDraft, editor: PublicFormEditor, workspaceName: string | null): PublicFormView {
  const options = new Map(editor.fields.map((field) => [field.fieldId, field]));
  return {
    title: draft.title,
    description: nullable(draft.description),
    submitLabel: draft.submitLabel,
    workspaceName,
    locale: nullable(draft.locale),
    fields: draft.fields.flatMap((field) => {
      const option = options.get(field.fieldId);
      if (!field.included || !option) return [];
      return [
        {
          fieldId: field.fieldId,
          label: field.label,
          helpText: nullable(field.helpText),
          required: field.required || option.required,
          valueType: option.valueType,
          multiple: option.multiple,
          options: option.options,
          currency: null,
        },
      ];
    }),
    person: draft.personEnabled ? { emailLabel: draft.emailLabel, nameLabel: nullable(draft.nameLabel) } : null,
    consent: draft.consentEnabled ? { text: draft.consentText, privacyUrl: draft.privacyUrl } : null,
    badge: editor.form?.usage.badge ?? false,
    renderToken: "",
  };
}
