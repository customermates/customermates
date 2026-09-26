import type { GlobalSearchResultItem } from "@/features/search/global-search.interactor";

import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";

export function entitySearchResultLabel(item: GlobalSearchResultItem, translate: (key: string) => string): string {
  if (item.type === "task") {
    const key = getSystemTaskNameTranslationKey(item.taskType);
    if (key) return translate(key);
  }
  return item.name;
}
