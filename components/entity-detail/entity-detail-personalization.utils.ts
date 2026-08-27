import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function reconcileAvailableIds(ids: string[] | undefined, availableIds: string[] | undefined): string[] {
  const unique = uniqueIds(ids ?? []);
  if (availableIds === undefined) return unique;
  const available = new Set(uniqueIds(availableIds));
  return unique.filter((id) => available.has(id));
}

export function reconcileColumnOrder(currentIds: string[], storedOrder: string[] | undefined): string[] {
  const current = uniqueIds(currentIds);
  const currentSet = new Set(current);
  const saved = uniqueIds(storedOrder ?? []).filter((id) => currentSet.has(id));
  const savedSet = new Set(saved);
  return [...saved, ...current.filter((id) => !savedSet.has(id))];
}

export function resolveOrderedCustomColumns(columns: CustomColumnDto[], storedOrder: string[] | undefined) {
  const byId = new Map(columns.map((column, formIndex) => [column.id, { column, formIndex }]));
  return reconcileColumnOrder(
    columns.map((column) => column.id),
    storedOrder,
  ).flatMap((id) => {
    const entry = byId.get(id);
    return entry ? [entry] : [];
  });
}
