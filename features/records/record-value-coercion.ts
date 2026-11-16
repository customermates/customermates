import type { RecordField, RecordScalar, RecordScalarInput } from "./record-model.schema";
import type { RecordIdentityInput } from "./record-identity.schema";

import { z } from "zod";

import { normalizeChannelValue } from "./channel-value";

export const ANSWER_LIMITS = { maxAnswerChars: 5_000, maxRichTextChars: 10_000 } as const;

export const ANSWERABLE_VALUE_TYPES = [
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

export type AnswerableValueType = (typeof ANSWERABLE_VALUE_TYPES)[number];

export type AnswerValue = string | string[] | boolean;

export type AnswerAssignment = { fieldId: string; value: RecordScalarInput };

export type AnswerError = "invalid" | "email";

export type AnswerEntryError = AnswerError | "required";

export type AnswerEntry = { fieldId: string; required: boolean };

export type AnswerField = Pick<
  RecordField,
  "id" | "typeId" | "valueType" | "required" | "multiple" | "options" | "format" | "archived"
> & { behavior: { kind: string } };

export type AnswerQuestion = {
  fieldId: string;
  label: string;
  helpText: string | null;
  required: boolean;
  valueType: AnswerableValueType;
  multiple: boolean;
  options: Array<{ id: string; label: string }>;
  currency: string | null;
};

export type CoercedAnswer =
  | { kind: "skip" }
  | { kind: "error"; error: AnswerError }
  | { kind: "value"; value: RecordScalar; display: string }
  | { kind: "identity"; identity: RecordIdentityInput; display: string };

export type CoercedAnswers = {
  errors: Record<string, AnswerEntryError>;
  fields: AnswerAssignment[];
  identities: RecordIdentityInput[];
  display: Record<string, string>;
};

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

export function isAnswerableValueType(value: string): value is AnswerableValueType {
  return (ANSWERABLE_VALUE_TYPES as readonly string[]).includes(value);
}

export function isAnswerableField(
  field: Pick<AnswerField, "archived" | "behavior" | "valueType" | "multiple">,
): boolean {
  if (field.archived || field.behavior.kind !== "input") return false;
  if (!isAnswerableValueType(field.valueType)) return false;
  return !field.multiple || field.valueType === "select";
}

export function hasTextValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function answerQuestion(
  field: Pick<AnswerField, "id" | "valueType" | "required" | "multiple" | "options" | "format">,
  entry: { label: string; helpText: string | null; required: boolean },
): AnswerQuestion | null {
  if (!isAnswerableValueType(field.valueType)) return null;
  return {
    fieldId: field.id,
    label: entry.label,
    helpText: entry.helpText,
    required: entry.required || field.required,
    valueType: field.valueType,
    multiple: field.multiple === true,
    options: field.options.map((option) => ({ id: option.id, label: option.label })),
    currency: field.valueType === "currency" ? (field.format?.currency ?? null) : null,
  };
}

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

function textOf(value: AnswerValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function convertSelect(field: Pick<AnswerField, "options" | "multiple">, raw: AnswerValue | undefined): CoercedAnswer {
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

function convertText(field: Pick<AnswerField, "valueType">, raw: AnswerValue | undefined): CoercedAnswer {
  const text = textOf(raw);
  if (!text) return { kind: "skip" };
  const max = field.valueType === "richText" ? ANSWER_LIMITS.maxRichTextChars : ANSWER_LIMITS.maxAnswerChars;
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

export function convertField(
  field: Pick<AnswerField, "valueType" | "options" | "multiple" | "format">,
  raw: AnswerValue | undefined,
): CoercedAnswer {
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

export function coerceAnswers(
  entries: readonly AnswerEntry[],
  typeId: string,
  modelFields: readonly AnswerField[],
  answers: Readonly<Record<string, AnswerValue>>,
): CoercedAnswers {
  const result: CoercedAnswers = { errors: {}, fields: [], identities: [], display: {} };

  for (const entry of entries) {
    const field = modelFields.find(
      (candidate) => candidate.id === entry.fieldId && candidate.typeId === typeId && isAnswerableField(candidate),
    );
    if (!field) continue;
    const converted = convertField(field, answers[entry.fieldId]);
    const required = entry.required || field.required;
    if (converted.kind === "error") result.errors[entry.fieldId] = converted.error;
    else if (converted.kind === "skip") {
      if (required) result.errors[entry.fieldId] = "required";
    } else if (converted.kind === "identity") {
      result.identities.push(converted.identity);
      result.display[entry.fieldId] = converted.display;
    } else {
      if (field.valueType === "boolean" && required && converted.value.kind === "boolean" && !converted.value.value)
        result.errors[entry.fieldId] = "required";
      result.fields.push({ fieldId: entry.fieldId, value: converted.value });
      result.display[entry.fieldId] = converted.display;
    }
  }

  return result;
}
