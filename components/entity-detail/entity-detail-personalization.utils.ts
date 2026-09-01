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

export function resolveSingleOpenSectionId(
  sectionIds: string[] | undefined,
  collapsedSectionIds: string[] | undefined,
  defaultCollapsedSectionIds: string[] | undefined,
): string | undefined {
  const availableSectionIds = uniqueIds(sectionIds ?? []);
  if (availableSectionIds.length === 0) return undefined;

  const collapsed = new Set(reconcileAvailableIds(collapsedSectionIds, availableSectionIds));
  const openSectionIds = availableSectionIds.filter((id) => !collapsed.has(id));
  if (openSectionIds.length === 1) return openSectionIds[0];

  const defaultCollapsed = new Set(reconcileAvailableIds(defaultCollapsedSectionIds, availableSectionIds));
  const defaultOpenSectionIds = availableSectionIds.filter((id) => !defaultCollapsed.has(id));
  return defaultOpenSectionIds.length === 1 ? defaultOpenSectionIds[0] : availableSectionIds[0];
}

export function collapsedSectionIdsForOpenSection(
  sectionIds: string[] | undefined,
  openSectionId: string | undefined,
): string[] {
  const availableSectionIds = uniqueIds(sectionIds ?? []);
  if (!openSectionId || !availableSectionIds.includes(openSectionId)) return [];
  return availableSectionIds.filter((id) => id !== openSectionId);
}

export function reconcileSingleOpenSections(
  sectionIds: string[] | undefined,
  collapsedSectionIds: string[] | undefined,
  defaultCollapsedSectionIds: string[] | undefined,
): string[] {
  const openSectionId = resolveSingleOpenSectionId(sectionIds, collapsedSectionIds, defaultCollapsedSectionIds);
  return collapsedSectionIdsForOpenSection(sectionIds, openSectionId);
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
