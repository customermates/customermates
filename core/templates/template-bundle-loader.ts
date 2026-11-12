import type { TemplateBundle } from "./template-spec.schema";

import { isTemplateSlug } from "./template-slugs";

export async function loadTemplateBundle(slug: string): Promise<TemplateBundle | null> {
  if (!isTemplateSlug(slug)) return null;
  const loaded = (await import(`./bundles/${slug}.json`)) as { default: unknown };
  return loaded.default as TemplateBundle;
}
