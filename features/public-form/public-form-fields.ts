import type { RecordField } from "@/features/records/record-model.schema";

export const FORM_FIELD_VALUE_TYPES = [
  "text",
  "richText",
  "number",
  "currency",
  "boolean",
  "date",
  "select",
  "url",
  "channels",
] as const;

export type FormFieldValueType = (typeof FORM_FIELD_VALUE_TYPES)[number];

type FormFieldCandidate = Pick<RecordField, "archived" | "behavior" | "valueType" | "multiple">;

export function isFormFieldValueType(value: string): value is FormFieldValueType {
  return (FORM_FIELD_VALUE_TYPES as readonly string[]).includes(value);
}

export function isFormEligibleField(field: FormFieldCandidate): boolean {
  if (field.archived || field.behavior.kind !== "input") return false;
  if (!isFormFieldValueType(field.valueType)) return false;
  return !field.multiple || field.valueType === "select";
}

export function hasTextValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
