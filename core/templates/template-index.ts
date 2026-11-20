import type { TemplateIndex, TemplateIndexEntry } from "./template-index.types";

import rawIndex from "./bundles/index.json";

const INDEX = rawIndex as unknown as TemplateIndex;

export function getTemplateIndex(): TemplateIndex {
  return INDEX;
}

export function getTemplateIndexEntry(slug: string, index: TemplateIndex = INDEX): TemplateIndexEntry | undefined {
  return index.find((entry) => entry.slug === slug);
}
