import type { TemplateBundle } from "./template-spec.schema";

import { readRuntimeJson } from "@/core/utils/runtime-json";

import { isTemplateSlug } from "./template-slugs";

export const TEMPLATE_BUNDLES_DIRECTORY = "core/templates/bundles";

export async function loadTemplateBundle(slug: string): Promise<TemplateBundle | null> {
  if (!isTemplateSlug(slug)) return null;
  return readRuntimeJson<TemplateBundle>(`${TEMPLATE_BUNDLES_DIRECTORY}/${slug}.json`);
}
