import type { LegacySearchResultItem } from "@/features/search/legacy-search-reference";

import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";

export function entitySearchResultLabel(item: LegacySearchResultItem, translate: (key: string) => string): string {
  if (item.type === "task") {
    const key = getSystemTaskNameTranslationKey(item.taskType);
    if (key) return translate(key);
  }
  return item.name;
}
