import type { RecordScalar, RecordFieldView } from "./record-model.schema";
import { filterScalar } from "./record-presentation";

export function recordInputValue(raw: unknown, field: RecordFieldView): RecordScalar | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.valueType === "richText") return { kind: "richText", documentJson: JSON.stringify(raw) };
  if (field.valueType === "boolean") return { kind: "boolean", value: Boolean(raw) };
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

export function recordDraftValue(value: RecordScalar | null | undefined): unknown {
  if (!value) return undefined;
  if (value.kind === "richText") return JSON.parse(value.documentJson);
  if (value.kind === "range") return `${value.start ?? ""},${value.end ?? ""}`;
  if (value.kind === "textList") return value.value.join("\n");
  if (value.kind === "selectList") return [...value.value];
  return value.value;
}

export function isRecordFieldWritable(field: RecordFieldView) {
  return (
    field.behavior.kind === "input" ||
    (field.behavior.kind === "snapshot" && Boolean(field.behavior.allowManualOverride))
  );
}

export function recordFieldTypeKey(field: Pick<RecordFieldView, "valueType" | "multiple">) {
  return field.valueType === "select" && field.multiple ? "multiSelect" : field.valueType;
}
