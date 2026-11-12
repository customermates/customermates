import type { TemplatePublicationOptions } from "./template-publication";

import { DEFAULT_LOCALE, buildLocalePath } from "@/i18n/locale-registry";

import { getTemplateIndex } from "./template-index";
import { ownPageSlugs } from "./template-publication";
import { templatePagePath } from "./templates-source";

export function templateLlmsLines(baseUrl: string, options: TemplatePublicationOptions = {}): string[] {
  const index = options.index ?? getTemplateIndex();
  const items = ownPageSlugs(DEFAULT_LOCALE, { ...options, index }).flatMap((slug) => {
    const entry = index.find((candidate) => candidate.slug === slug);
    const text = entry?.locales[DEFAULT_LOCALE];
    if (!text?.page) return [];
    const url = `${baseUrl}${buildLocalePath(DEFAULT_LOCALE, templatePagePath(slug))}`;
    return [`- [${text.name}](${url}): ${text.page.metaDescription}`];
  });

  return items.length > 0 ? ["## Templates", ...items, ""] : [];
}
