import type { RecordField, RecordScalar } from "./record-model.schema";
import { filterScalar } from "./record-presentation";

export function recordInputValue(raw: unknown, field: RecordField): RecordScalar | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.valueType === "richText") return { kind: "richText", documentJson: JSON.stringify(raw) };
  if (field.valueType === "boolean") return { kind: "boolean", value: Boolean(raw) };
  if (field.multiple) return { kind: "textList", value: String(raw).split("\n") };
  if (field.valueType === "dateRange" || field.valueType === "dateTimeRange") {
    const [start, end] = String(raw).split(",");
    return { kind: "range", start: start || null, end: end || null };
  }
  return filterScalar(String(raw), field);
}
