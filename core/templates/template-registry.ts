import type { TemplateIndexEntry } from "./template-index.types";
import type { TemplateDeployment } from "./template-publication";
import type { TemplateBundle, TemplateLocale, TemplateSpec } from "./template-spec.schema";
import type { TemplateSlug } from "./template-slugs";

import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

import { loadTemplateBundle } from "./template-bundle-loader";
import { getTemplateIndexEntry } from "./template-index";
import { isTemplateOffered } from "./template-publication";
import { TEMPLATE_SLUGS } from "./template-slugs";

export { TEMPLATE_SLUGS, isTemplateSlug } from "./template-slugs";
export type { TemplateSlug } from "./template-slugs";

async function bundleOf(slug: TemplateSlug): Promise<TemplateBundle> {
  const bundle = await loadTemplateBundle(slug);
  if (!bundle) throw new Error(`Template ${slug} has no bundle`);
  return bundle;
}

function indexEntryOf(slug: TemplateSlug): TemplateIndexEntry {
  const entry = getTemplateIndexEntry(slug);
  if (!entry) throw new Error(`Template ${slug} is not in the template index`);
  return entry;
}

function textOf(text: TemplateBundle["text"], slug: TemplateSlug, locale: string): TemplateLocale {
  const found = text[locale] ?? text[DEFAULT_LOCALE];
  if (!found) throw new Error(`Template ${slug} has no ${DEFAULT_LOCALE} text`);
  return found;
}

export async function getTemplate(slug: TemplateSlug): Promise<TemplateSpec> {
  return (await bundleOf(slug)).spec;
}

export async function getTemplateText(slug: TemplateSlug, locale: string): Promise<TemplateLocale> {
  return textOf((await bundleOf(slug)).text, slug, locale);
}

export async function loadTemplate(
  slug: TemplateSlug,
  locale: string,
): Promise<{ spec: TemplateSpec; text: TemplateLocale }> {
  const { spec, text } = await bundleOf(slug);
  return { spec, text: textOf(text, slug, locale) };
}

export function hasTemplateText(slug: TemplateSlug, locale: string): boolean {
  return indexEntryOf(slug).locales[locale] !== undefined;
}

export type TemplateListing = {
  slug: TemplateSlug;
  name: string;
  summary: string;
  translated: boolean;
};

export function listOfferedTemplates(options: { locale: string; deployment: TemplateDeployment }): TemplateListing[] {
  return TEMPLATE_SLUGS.flatMap((slug) => {
    const entry = indexEntryOf(slug);
    if (!isTemplateOffered(entry, options.deployment)) return [];
    const own = entry.locales[options.locale];
    const shown = own ?? entry.locales[DEFAULT_LOCALE];
    if (!shown) throw new Error(`Template ${slug} has no ${DEFAULT_LOCALE} text`);
    return [{ slug, name: shown.name, summary: shown.summary, translated: own !== undefined }];
  });
}
