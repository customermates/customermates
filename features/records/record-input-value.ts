import type { RecordScalar, RecordScalarInput, RecordFieldView } from "./record-model.schema";
import type { RecordAddressPart } from "./record-address-value";
import { filterScalar } from "./record-presentation";
import { RECORD_ADDRESS_PARTS, unverifiedAddressScalar } from "./record-address-value";

export function recordInputValue(raw: unknown, field: RecordFieldView): RecordScalar | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.valueType === "richText") return { kind: "richText", documentJson: JSON.stringify(raw) };
  if (field.valueType === "boolean") return { kind: "boolean", value: Boolean(raw) };
  if (field.valueType === "file") {
    const ids = Array.isArray(raw) ? raw.map(String) : [];
    return ids.length ? { kind: "file", value: ids } : null;
  }
  if (field.valueType === "address") return addressInput(raw);
  if (field.multiple && field.valueType === "select") {
    const ids = Array.isArray(raw) ? raw.map(String) : [];
    return ids.length ? { kind: "selectList", value: ids } : null;
  }
  if (field.multiple) return { kind: "textList", value: String(raw).split("\n") };
  if (field.valueType === "dateRange" || field.valueType === "dateTimeRange") {
    const [start, end] = String(raw).split(",");
    return { kind: "range", start: start || null, end: end || null };
  }
  return filterScalar(String(raw), field);
}

export type AddressDraftParts = Record<RecordAddressPart, string | null>;
export type AddressDraft = AddressDraftParts & { verified?: AddressDraftParts; candidateToken?: string };

export function addressDraftParts(raw: unknown): AddressDraftParts {
  const draft = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Record<string, unknown>>;
  return Object.fromEntries(
    RECORD_ADDRESS_PARTS.map((part) => {
      const value = draft[part];
      return [part, typeof value === "string" && value.trim() ? value.trim() : null];
    }),
  ) as AddressDraftParts;
}

export function isVerifiedAddressDraft(raw: unknown): boolean {
  const verified = (raw as Partial<AddressDraft> | null | undefined)?.verified;
  if (!verified) return false;
  const parts = addressDraftParts(raw);
  const expected = addressDraftParts(verified);
  return RECORD_ADDRESS_PARTS.every((part) => parts[part] === expected[part]) && Object.values(parts).some(Boolean);
}

export function verifiedAddressDraft(parts: AddressDraftParts, candidateToken: string): AddressDraft {
  return { ...parts, verified: { ...parts }, candidateToken };
}

function addressInput(raw: unknown): RecordScalar | null {
  if (typeof raw !== "object" || raw === null) return null;
  return unverifiedAddressScalar(addressDraftParts(raw));
}

function addressDraft(value: RecordScalar | null | undefined): AddressDraft {
  const parts = Object.fromEntries(
    RECORD_ADDRESS_PARTS.map((part) => [part, value?.kind === "address" ? (value.value[part] ?? null) : null]),
  ) as AddressDraftParts;
  return value?.kind === "address" && value.value.verification.status === "verified"
    ? { ...parts, verified: { ...parts } }
    : parts;
}

export function recordWriteValue(raw: unknown, field: RecordFieldView): RecordScalarInput | null {
  const candidateToken = (raw as Partial<AddressDraft> | null | undefined)?.candidateToken;
  if (field.valueType === "address" && typeof candidateToken === "string" && isVerifiedAddressDraft(raw))
    return { kind: "address", candidateToken };
  return recordInputValue(raw, field);
}

export function recordDraftValue(
  value: RecordScalar | null | undefined,
  field?: Pick<RecordFieldView, "valueType">,
): unknown {
  if (field?.valueType === "address") return addressDraft(value);
  if (!value) return undefined;
  if (value.kind === "file") return [...value.value];
  if (value.kind === "richText") return JSON.parse(value.documentJson);
  if (value.kind === "range") return `${value.start ?? ""},${value.end ?? ""}`;
  if (value.kind === "textList") return value.value.join("\n");
  if (value.kind === "selectList") return [...value.value];
  return value.value;
}

export function isRecordFieldWritable(field: RecordFieldView) {
  return (
    field.valueType !== "channels" &&
    (field.behavior.kind === "input" ||
      (field.behavior.kind === "snapshot" && Boolean(field.behavior.allowManualOverride)))
  );
}

export function recordFieldTypeKey(field: Pick<RecordFieldView, "valueType" | "multiple">) {
  return field.valueType === "select" && field.multiple ? "multiSelect" : field.valueType;
}
