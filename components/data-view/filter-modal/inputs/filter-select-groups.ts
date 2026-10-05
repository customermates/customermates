import type { FilterSelectItem } from "./use-filter-select-items";

export function filterSelectGroups(items: FilterSelectItem[]) {
  const groups = new Map<string, { key: string; label?: string; items: FilterSelectItem[] }>();
  for (const item of items) {
    const key = item.groupKey ?? "";
    let group = groups.get(key);
    if (!group) {
      group = { key, label: item.groupLabel, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
