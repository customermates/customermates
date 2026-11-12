import type { PublicFormFieldError, PublicFormView } from "@/features/public-form/public-form.schema";

export type FormValue = string | string[] | boolean;

export type FormValues = Record<string, FormValue>;

export type FormErrors = Record<string, PublicFormFieldError>;

type FormField = PublicFormView["fields"][number];

export function initialFormValues(fields: readonly FormField[]): FormValues {
  return Object.fromEntries(
    fields.map((field) => [field.fieldId, field.valueType === "boolean" ? false : field.multiple ? [] : ""]),
  );
}

function isEmpty(field: FormField, value: FormValue | undefined): boolean {
  if (field.valueType === "boolean") return value !== true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value !== "string" || value.trim().length === 0;
}

export function missingFormValues(
  form: Pick<PublicFormView, "fields" | "person" | "consent">,
  values: FormValues,
  contact: { email: string; consent: boolean },
): FormErrors {
  const errors: FormErrors = {};
  for (const field of form.fields) if (field.required && isEmpty(field, values[field.fieldId])) errors[field.fieldId] = "required";
  if (form.person && contact.email.trim().length === 0) errors.email = "required";
  if (form.consent && !contact.consent) errors.consent = "consent";
  return errors;
}
