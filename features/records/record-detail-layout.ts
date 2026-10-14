import type { P13nEntry } from "@/features/p13n/prisma-p13n.repository";
import type { RecordModel } from "./record-model.schema";
import type { RecordDetailLayout } from "./record-detail-layout.schema";
import { recordColumns } from "./record-columns";

export function storedRecordDetailLayout(stored: P13nEntry | undefined): RecordDetailLayout | null {
  const options = stored?.detailOptions;
  return options
    ? {
        pinnedFields: options.starredFieldIds,
        hiddenFields: options.hiddenFieldIds ?? [],
        fieldOrder: options.fieldOrder ?? stored?.columnOrder ?? [],
      }
    : null;
}

export function recordDetailLayoutIsValid(typeId: string, layout: RecordDetailLayout, model: RecordModel): boolean {
  if (!model.types.some((type) => type.id === typeId && !type.archived)) return false;
  const available = new Set(recordColumns(typeId, model).map((column) => column.id));
  return [layout.pinnedFields, layout.hiddenFields, layout.fieldOrder].every(
    (keys) => new Set(keys).size === keys.length && keys.every((id) => available.has(id)),
  );
}

export function cleanRecordDetailLayout(typeId: string, layout: RecordDetailLayout, model: RecordModel) {
  const available = new Set(recordColumns(typeId, model).map((column) => column.id));
  const keep = (keys: string[]) => [...new Set(keys)].filter((id) => available.has(id));
  const cleaned = {
    pinnedFields: keep(layout.pinnedFields),
    hiddenFields: keep(layout.hiddenFields),
    fieldOrder: keep(layout.fieldOrder),
  };
  return recordDetailLayoutIsValid(typeId, cleaned, model) ? cleaned : null;
}
