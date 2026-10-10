import type { RecordColumn } from "@/features/records/record-columns";
import type { CalculatedValue, RecordFieldView } from "@/features/records/record-model.schema";
import type { RecordRow } from "@/features/records/record-presentation";

export function isEmptyResult(result: CalculatedValue | undefined) {
  if (!result || result.state === "missing") return true;
  if (result.state !== "value") return false;
  const value = result.value;
  return (value.kind === "selectList" || value.kind === "textList") && value.value.length === 0;
}

export type RecordChipColumn = RecordColumn<RecordFieldView>;

export type RecordChipEntry = { column: RecordChipColumn; icon: string; showName: boolean; empty: boolean };

function chipIcon(column: RecordChipColumn) {
  if (column.kind === "field") return `type:${column.field.valueType}`;
  if (column.kind === "relationship")
    return `list:${column.direction === "outgoing" ? column.relation.targetTypeId : column.relation.sourceTypeId}`;
  if (column.kind === "relationshipPath") return `list:${column.targetTypeId}`;
  return column.id === "system:assignedTo" ? "type:member" : "type:dateTime";
}

export function linkSummary(record: RecordRow, column: RecordChipColumn) {
  if (column.kind === "relationship") {
    return record.relationships.find(
      (summary) => summary.relationId === column.relation.id && summary.direction === column.direction,
    );
  }
  if (column.kind === "relationshipPath")
    return record.relationshipPaths?.find((summary) => summary.pathId === column.definition.id);
  return undefined;
}

export function isEmptyColumn(record: RecordRow, column: RecordChipColumn) {
  if (column.kind === "field") {
    if (column.field.valueType === "channels") return !record.identities?.length;
    const result = record.fields.find((value) => value.fieldId === column.field.id)?.result;
    if (result?.state === "value" && result.value.kind === "boolean") return !result.value.value;
    return isEmptyResult(result);
  }
  if (column.kind === "relationship" || column.kind === "relationshipPath")
    return !linkSummary(record, column)?.records.length;
  if (column.id === "system:assignedTo") return record.assignedUsers.length === 0;
  return false;
}

export function recordChipRowModel(
  columns: RecordChipColumn[],
  record: RecordRow,
  { keepEmpty = false }: { keepEmpty?: boolean } = {},
) {
  const empty = columns.filter((column) => isEmptyColumn(record, column));
  const filled = columns.filter((column) => !empty.includes(column));
  const iconCounts = new Map<string, number>();
  for (const column of filled) iconCounts.set(chipIcon(column), (iconCounts.get(chipIcon(column)) ?? 0) + 1);
  return {
    entries: (keepEmpty ? columns : filled).map(
      (column): RecordChipEntry => ({
        column,
        icon: chipIcon(column),
        showName: (iconCounts.get(chipIcon(column)) ?? 0) > 1,
        empty: empty.includes(column),
      }),
    ),
    empty,
  };
}
