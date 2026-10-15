import type { RecordScalar, RecordFieldView } from "./record-model.schema";
import { filterScalar } from "./record-presentation";
import { normalizeRecordInput } from "./record-model-validation";

export function recordInputValue(raw: unknown, field: RecordFieldView): RecordScalar | null {
  const value = parsedRecordInput(raw, field);
  return value && normalizeRecordInput(value, field.valueType);
}

function parsedRecordInput(raw: unknown, field: RecordFieldView): RecordScalar | null {
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

const ADDRESS_PARTS = ["street", "line2", "postalCode", "city", "region", "countryCode"] as const;
type AddressDraft = Record<(typeof ADDRESS_PARTS)[number], string | null>;

function addressInput(raw: unknown): RecordScalar | null {
  if (typeof raw !== "object" || raw === null) return null;
  const draft = raw as Partial<AddressDraft>;
  const parts = Object.fromEntries(
    ADDRESS_PARTS.map((part) => [
      part,
      typeof draft[part] === "string" && draft[part].trim() ? draft[part].trim() : null,
    ]),
  ) as AddressDraft;
  if (!Object.values(parts).some(Boolean)) return null;
  return {
    kind: "address",
    value: {
      ...parts,
      formatted: "",
      location: null,
      verification: { status: "unverified", provider: null, checkedAt: null },
    },
  };
}

function addressDraft(value: RecordScalar | null | undefined): AddressDraft {
  return Object.fromEntries(
    ADDRESS_PARTS.map((part) => [part, value?.kind === "address" ? (value.value[part] ?? null) : null]),
  ) as AddressDraft;
}

export function recordDraftValue(
  value: RecordScalar | null | undefined,
  field?: Pick<RecordFieldView, "valueType">,
): unknown {
  if (field?.valueType === "address") return addressDraft(value);
  if (!value) return undefined;
  if (value.kind === "file") return [...value.value];
  if (value.kind === "address") return { ...value.value };
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
