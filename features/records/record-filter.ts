import type { RecordField, RecordFieldView } from "./record-model.schema";
import type { RecordQuery } from "./record-query.schema";

export type RecordFilterField = Pick<RecordField, "id" | "label" | "valueType" | "multiple" | "format" | "options">;

export function recordFilterOperators(
  field: Pick<RecordField, "valueType" | "multiple">,
): RecordQuery["filters"][number]["operator"][] {
  if (field.valueType === "richText") return ["contains", "empty", "notEmpty"];
  if (field.valueType === "select" && field.multiple) return ["in", "all", "notIn", "empty", "notEmpty"];
  if (["dateRange", "dateTimeRange"].includes(field.valueType))
    return ["contains", "gt", "gte", "lt", "lte", "between", "inLastDays", "notInLastDays", "empty", "notEmpty"];
  const operators: RecordQuery["filters"][number]["operator"][] = ["eq", "ne", "empty", "notEmpty"];
  if (!field.multiple) operators.push("in", "notIn");
  if (["text", "email", "phone", "url"].includes(field.valueType)) operators.push("contains", "startsWith");
  if (!field.multiple && ["number", "currency", "date", "dateTime"].includes(field.valueType))
    operators.push("gt", "gte", "lt", "lte");
  if (["date", "dateTime"].includes(field.valueType)) operators.push("between", "inLastDays", "notInLastDays");
  return operators;
}

export function recordFilterFields(
  fields: RecordFieldView[],
  labels: { createdAt: string; updatedAt: string; assignedTo: string },
): RecordFilterField[] {
  return [
    ...fields.filter((field) => !field.archived && recordFilterOperators(field).length > 0),
    { id: "system:createdAt", label: labels.createdAt, valueType: "dateTime", multiple: false, options: [] },
    { id: "system:updatedAt", label: labels.updatedAt, valueType: "dateTime", multiple: false, options: [] },
    { id: "system:assignedTo", label: labels.assignedTo, valueType: "member", multiple: false, options: [] },
  ];
}
