import type { RecordField, RecordScalar, RecordScalarInput } from "@/features/records/record-model.schema";
import type { RecordIdentityInput } from "@/features/records/record-identity.schema";
import type { PublicFormConfig, PublicFormFieldError } from "./public-form.schema";

import { z } from "zod";

import { normalizeChannelValue } from "@/features/records/channel-value";

import { hasTextValue, isFormEligibleField } from "./public-form-fields";
import { PUBLIC_FORM_LIMITS } from "./public-form-limits";

export type FormAnswerValue = string | string[] | boolean;

export type FormAnswerInput = {
  answers: Record<string, FormAnswerValue>;
  email?: string;
  name?: string;
};

export type FormAssignment = { fieldId: string; value: RecordScalarInput };

export type AcceptedFormAnswers = {
  ok: true;
  fields: FormAssignment[];
  identities: RecordIdentityInput[];
  display: Record<string, string>;
  email: string | null;
  name: string | null;
};

export type BuiltFormAnswers = AcceptedFormAnswers | { ok: false; errors: Record<string, PublicFormFieldError> };

export function mutationFieldErrors(
  fields: readonly FormAssignment[],
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>,
): Record<string, PublicFormFieldError> {
  const errors: Record<string, PublicFormFieldError> = {};
  for (const issue of issues) {
    const at = issue.path.indexOf("fields");
    const index = at >= 0 ? issue.path[at + 1] : undefined;
    const field = typeof index === "number" ? fields[index] : undefined;
    if (field) errors[field.fieldId] = "invalid";
  }
  return errors;
}

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function richTextDocument(text: string): string {
  const paragraphs = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] }));
  return JSON.stringify({ type: "doc", content: paragraphs });
}

function textOf(value: FormAnswerValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export type Converted =
  | { kind: "skip" }
  | { kind: "error"; error: PublicFormFieldError }
  | { kind: "value"; value: RecordScalar; display: string }
  | { kind: "identity"; identity: RecordIdentityInput; display: string };

function convertSelect(field: RecordField, raw: FormAnswerValue | undefined): Converted {
  const known = new Set(field.options.map((option) => option.id));
  const labels = new Map(field.options.map((option) => [option.id, option.label]));
  if (field.multiple) {
    const ids = Array.isArray(raw) ? [...new Set(raw)] : typeof raw === "string" && raw ? [raw] : [];
    if (ids.length === 0) return { kind: "skip" };
    if (!ids.every((id) => known.has(id))) return { kind: "error", error: "invalid" };
    return {
      kind: "value",
      value: { kind: "selectList", value: ids },
      display: ids.map((id) => labels.get(id) ?? id).join(", "),
    };
  }
  const id = textOf(raw);
  if (!id) return { kind: "skip" };
  if (!known.has(id)) return { kind: "error", error: "invalid" };
  return { kind: "value", value: { kind: "select", value: id }, display: labels.get(id) ?? id };
}

function convertText(field: RecordField, raw: FormAnswerValue | undefined): Converted {
  const text = textOf(raw);
  if (!text) return { kind: "skip" };
  const max = field.valueType === "richText" ? PUBLIC_FORM_LIMITS.maxRichTextChars : PUBLIC_FORM_LIMITS.maxAnswerChars;
  if (text.length > max) return { kind: "error", error: "invalid" };
  if (field.valueType === "richText")
    return { kind: "value", value: { kind: "richText", documentJson: richTextDocument(text) }, display: text };
  if (field.valueType === "url") {
    const valid = z
      .url({ protocol: /^https?$/ })
      .max(2000)
      .safeParse(text).success;
    return valid
      ? { kind: "value", value: { kind: "text", value: text }, display: text }
      : { kind: "error", error: "invalid" };
  }
  return { kind: "value", value: { kind: "text", value: text }, display: text };
}

export function convertField(field: RecordField, raw: FormAnswerValue | undefined): Converted {
  switch (field.valueType) {
    case "boolean": {
      if (raw === undefined || raw === "") return { kind: "skip" };
      const flag = raw === true || raw === "true";
      return { kind: "value", value: { kind: "boolean", value: flag }, display: String(flag) };
    }
    case "number":
    case "currency": {
      const text = textOf(raw).replace(",", ".");
      if (!text) return { kind: "skip" };
      if (!DECIMAL.test(text) || text.length > 40) return { kind: "error", error: "invalid" };
      const currency = field.valueType === "currency" ? (field.format?.currency ?? null) : null;
      return { kind: "value", value: { kind: "decimal", value: text, currency }, display: text };
    }
    case "date": {
      const text = textOf(raw);
      if (!text) return { kind: "skip" };
      return validDate(text)
        ? { kind: "value", value: { kind: "date", value: text }, display: text }
        : { kind: "error", error: "invalid" };
    }
    case "select":
      return convertSelect(field, raw);
    case "channels": {
      const text = textOf(raw);
      if (!text) return { kind: "skip" };
      const value = normalizeChannelValue("mail", text);
      return value
        ? { kind: "identity", identity: { provider: "mail", value }, display: value }
        : { kind: "error", error: "email" };
    }
    default:
      return convertText(field, raw);
  }
}

export function buildFormAnswers(
  config: PublicFormConfig,
  typeId: string,
  modelFields: readonly RecordField[],
  input: FormAnswerInput,
): BuiltFormAnswers {
  const errors: Record<string, PublicFormFieldError> = {};
  const fields: FormAssignment[] = [];
  const identities: RecordIdentityInput[] = [];
  const display: Record<string, string> = {};

  for (const entry of config.fields) {
    const field = modelFields.find(
      (candidate) => candidate.id === entry.fieldId && candidate.typeId === typeId && isFormEligibleField(candidate),
    );
    if (!field) continue;
    const converted = convertField(field, input.answers[entry.fieldId]);
    const required = entry.required || field.required;
    if (converted.kind === "error") errors[entry.fieldId] = converted.error;
    else if (converted.kind === "skip") {
      if (required) errors[entry.fieldId] = "required";
    } else if (converted.kind === "identity") {
      identities.push(converted.identity);
      display[entry.fieldId] = converted.display;
    } else {
      if (field.valueType === "boolean" && required && converted.value.kind === "boolean" && !converted.value.value)
        errors[entry.fieldId] = "required";
      fields.push({ fieldId: entry.fieldId, value: converted.value });
      display[entry.fieldId] = converted.display;
    }
  }

  let email: string | null = null;
  let name: string | null = null;
  if (config.person) {
    const rawEmail = (input.email ?? "").trim();
    if (!rawEmail) errors.email = "required";
    else {
      email = normalizeChannelValue("mail", rawEmail);
      if (!email) errors.email = "email";
    }
    const rawName = (input.name ?? "").trim();
    if (config.person.nameLabel && hasTextValue(rawName)) {
      if (rawName.length > 200) errors.name = "invalid";
      else name = rawName;
    }
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, fields, identities, display, email, name };
}
