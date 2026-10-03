import { recordInvariant } from "./record-invariant";

import { Prisma } from "@/generated/prisma";

import type { RecordValue } from "@/generated/prisma";
import type { CalculatedValue, RecordField, RecordScalar } from "./record-model.schema";

import { CalculatedValueSchema } from "./record-model.schema";

export function recordJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function encodeRecordValue(result: CalculatedValue) {
  const row: {
    state: string;
    textValue: string | null;
    textListValue: string[];
    lexicalValue: string | null;
    decimalValue: Prisma.Decimal | null;
    currency: string | null;
    booleanValue: boolean | null;
    instantValue: Date | null;
    rangeStart: Date | null;
    rangeEnd: Date | null;
    jsonValue: Prisma.InputJsonValue | null;
    errorCode: string | null;
  } = {
    state: result.state,
    textValue: null,
    textListValue: [],
    lexicalValue: null,
    decimalValue: null,
    currency: null,
    booleanValue: null,
    instantValue: null,
    rangeStart: null,
    rangeEnd: null,
    jsonValue: null,
    errorCode: null,
  };
  if (result.state === "restricted")
    throw new Error("Reader-dependent restrictions must never be persisted as calculated values");
  if (result.state === "error") row.errorCode = result.code;
  if (result.state !== "value") return row;
  const scalar = result.value;
  switch (scalar.kind) {
    case "textList":
      row.textListValue = scalar.value;
      break;
    case "decimal":
      row.decimalValue = new Prisma.Decimal(scalar.value);
      row.currency = scalar.currency;
      break;
    case "boolean":
      row.booleanValue = scalar.value;
      break;
    case "date":
    case "dateTime":
      row.instantValue = new Date(scalar.value);
      row.lexicalValue = scalar.value;
      break;
    case "range":
      row.rangeStart = scalar.start ? new Date(scalar.start) : null;
      row.rangeEnd = scalar.end ? new Date(scalar.end) : null;
      row.jsonValue = recordJson({ start: scalar.start, end: scalar.end });
      break;
    case "richText":
      row.jsonValue = recordJson(JSON.parse(scalar.documentJson));
      break;
    default:
      row.textValue = scalar.value;
  }
  return row;
}

export function decodeRecordValue(row: RecordValue | undefined, field: RecordField): CalculatedValue {
  if (!row || row.state === "missing") return { state: "missing" };
  if (row.state === "error") return CalculatedValueSchema.parse({ state: "error", code: row.errorCode });
  if (field.multiple) {
    return CalculatedValueSchema.parse({
      state: "value",
      value: { kind: "textList", value: row.textListValue },
    });
  }
  let value: RecordScalar;
  switch (field.valueType) {
    case "number":
    case "currency":
      value = {
        kind: "decimal",
        value: recordInvariant(row.decimalValue).toFixed(),
        currency: row.currency,
      };
      break;
    case "boolean":
      value = { kind: "boolean", value: recordInvariant(row.booleanValue) };
      break;
    case "date":
      value = {
        kind: "date",
        value: row.lexicalValue ?? recordInvariant(row.instantValue).toISOString().slice(0, 10),
      };
      break;
    case "dateTime":
      value = {
        kind: "dateTime",
        value: row.lexicalValue ?? recordInvariant(row.instantValue).toISOString(),
      };
      break;
    case "dateRange":
    case "dateTimeRange":
      value = {
        kind: "range",
        ...(row.jsonValue as { start: string | null; end: string | null }),
      };
      break;
    case "richText":
      value = { kind: "richText", documentJson: JSON.stringify(row.jsonValue) };
      break;
    case "select":
      value = { kind: "select", value: recordInvariant(row.textValue) };
      break;
    case "member":
      value = { kind: "member", value: recordInvariant(row.textValue) };
      break;
    default:
      value = { kind: "text", value: recordInvariant(row.textValue) };
  }
  return CalculatedValueSchema.parse({ state: "value", value });
}
