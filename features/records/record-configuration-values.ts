import Decimal from "decimal.js";
import { z } from "zod";

import { unwindFailure } from "@/core/validation/failure-unwind";
import type { RecordField, RecordModel, RecordScalar } from "./record-model.schema";
import type { StoredRecord } from "./record.repo";

import { decodeRecordValue } from "./record-storage";
import { normalizeRecordScalar } from "./record-write.service";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { canonicalRecordJson, compareRecordKey } from "./record-json";
import { RecordDateTimeSchema } from "./record-model.schema";
import { normalizeRecordInput, scalarMatchesType } from "./record-model-validation";

const EXAMPLE_LENGTH = 40;
const DECIMAL_TEXT = /^[+-]?\d+(?:\.\d+)?$/;

export function fieldValueDefinition(field: RecordField | undefined): string {
  if (!field) return "";
  return canonicalRecordJson({
    valueType: field.valueType,
    multiple: field.multiple ?? false,
    required: field.required,
    archived: field.archived,
    publishedSummary: field.publishedSummary,
    currency: field.valueType === "currency" ? (field.format?.currency ?? null) : null,
    behavior: field.behavior,
    options: field.options
      .map(({ id, attributes }) => ({ id, attributes }))
      .sort((a, b) => compareRecordKey(a.id, b.id)),
  });
}

export function configurationInputFields(previous: RecordModel, next: RecordModel): RecordField[] {
  return next.fields.filter(
    (field) =>
      !field.archived &&
      field.valueType !== "channels" &&
      (field.behavior.kind === "input" ||
        (field.behavior.kind === "snapshot" && previous.fields.some((before) => before.id === field.id))) &&
      fieldValueDefinition(previous.fields.find((before) => before.id === field.id)) !== fieldValueDefinition(field),
  );
}

export function configurationInputValue(
  row: StoredRecord,
  before: RecordField | undefined,
  field: RecordField,
): RecordScalar | null {
  const value = decodeRecordValue(
    row.values.find((value) => value.fieldId === field.id),
    before ?? field,
  );
  if (before && value.state === "error") throw unwindFailure(CustomErrorCode.recordValueInvalid);
  const scalar =
    value.state === "value"
      ? value.value
      : before || field.behavior.kind !== "input"
        ? null
        : (field.behavior.defaultValue ?? null);
  return normalizeRecordScalar(
    convertScalar(scalar, before, field),
    row.protectedKind === "membershipAuthorization" ? { ...field, required: false } : field,
  );
}

export function configurationValueExample(row: StoredRecord, before: RecordField | undefined): string | null {
  if (!before) return null;
  const value = decodeRecordValue(
    row.values.find((value) => value.fieldId === before.id),
    before,
  );
  if (value.state !== "value") return null;
  const scalar = value.value;
  const text =
    scalarText(scalar, before) ??
    (scalar.kind === "textList"
      ? scalar.value.join(", ")
      : scalar.kind === "range"
        ? `${scalar.start ?? ""} – ${scalar.end ?? ""}`
        : scalar.kind === "decimal"
          ? `${scalar.value} ${scalar.currency ?? ""}`.trim()
          : null);
  if (text === null) return null;
  return text.length > EXAMPLE_LENGTH ? `${text.slice(0, EXAMPLE_LENGTH - 1)}…` : text;
}

function optionLabel(id: string, field: RecordField): string {
  return field.options.find((option) => option.id === id)?.label ?? id;
}

function scalarText(scalar: RecordScalar, before: RecordField): string | null {
  switch (scalar.kind) {
    case "text":
    case "date":
    case "dateTime":
      return scalar.value;
    case "decimal":
      return scalar.currency === null ? scalar.value : null;
    case "boolean":
      return String(scalar.value);
    case "select":
      return optionLabel(scalar.value, before);
    case "selectList":
      return scalar.value.map((id) => optionLabel(id, before)).join(", ");
    default:
      return null;
  }
}

function matchingOption(text: string, field: RecordField): string | null {
  const wanted = text.trim().toLocaleLowerCase();
  const option =
    field.options.find((candidate) => candidate.id === text.trim()) ??
    field.options.find((candidate) => candidate.label.trim().toLocaleLowerCase() === wanted);
  return option?.id ?? null;
}

function textValues(scalar: RecordScalar): string[] | null {
  if (scalar.kind === "text") return [scalar.value];
  if (scalar.kind === "textList") return scalar.value;
  return null;
}

function convertChoiceScalar(scalar: RecordScalar, field: RecordField): RecordScalar {
  if (field.multiple && scalar.kind === "select") return { kind: "selectList", value: [scalar.value] };
  if (!field.multiple && scalar.kind === "selectList" && scalar.value.length === 1)
    return { kind: "select", value: scalar.value[0] };
  const texts = textValues(scalar);
  if (!texts) return scalar;
  const ids = texts.map((text) => matchingOption(text, field));
  if (ids.some((id) => id === null)) return scalar;
  const matched = ids as string[];
  if (field.multiple) return { kind: "selectList", value: [...new Set(matched)] };
  return matched.length === 1 ? { kind: "select", value: matched[0] } : scalar;
}

function convertText(text: string, field: RecordField): RecordScalar | null {
  const trimmed = text.trim();
  switch (field.valueType) {
    case "number":
      return DECIMAL_TEXT.test(trimmed)
        ? { kind: "decimal", value: new Decimal(trimmed).toFixed(), currency: null }
        : null;
    case "date":
      return z.iso.date().safeParse(trimmed).success ? { kind: "date", value: trimmed } : null;
    case "dateTime":
      return RecordDateTimeSchema.safeParse(trimmed).success ? { kind: "dateTime", value: trimmed } : null;
    case "email":
    case "url":
    case "phone":
      return { kind: "text", value: trimmed };
    default:
      return null;
  }
}

function convertScalar(
  scalar: RecordScalar | null,
  before: RecordField | undefined,
  field: RecordField,
): RecordScalar | null {
  if (!scalar || scalarMatchesType(normalizeRecordInput(scalar, field.valueType), field.valueType, field.multiple))
    return scalar;
  if (field.valueType === "select") return convertChoiceScalar(scalar, field);
  if (!before || field.multiple) return scalar;
  if (field.valueType === "text") {
    const text = scalarText(scalar, before);
    return text === null ? scalar : { kind: "text", value: text };
  }
  return (scalar.kind === "text" && convertText(scalar.value, field)) || scalar;
}
