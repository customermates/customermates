import type { Capability } from "@/core/capabilities/capabilities";
import type { TemplateIndexEntry, TemplateIndexLocale } from "./template-index.types";
import type { TemplateBundle, TemplateLocale, TemplateSpec } from "./template-spec.schema";
import type { TemplateSlug } from "./template-slugs";

import { SHIPPED_CAPABILITIES } from "@/core/capabilities/capabilities";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

import { loadTemplateBundle } from "./template-bundle-loader";
import { getTemplateIndexEntry } from "./template-index";
import { TEMPLATE_SLUGS } from "./template-slugs";

export { TEMPLATE_SLUGS, isTemplateSlug } from "./template-slugs";
export type { TemplateSlug } from "./template-slugs";

export type TemplateDeployment = "cloud" | "self-hosted";

export const CLOUD_ONLY_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(["calendarWrite"]);

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

function offeredBy(
  entry: TemplateIndexEntry,
  options: { deployment: TemplateDeployment; shipped?: ReadonlySet<Capability> },
): boolean {
  const shipped = options.shipped ?? SHIPPED_CAPABILITIES;
  return entry.requiresCapabilities.every(
    (capability) =>
      shipped.has(capability) && (options.deployment === "cloud" || !CLOUD_ONLY_CAPABILITIES.has(capability)),
  );
}

export function isTemplateOffered(
  slug: TemplateSlug,
  options: { deployment: TemplateDeployment; shipped?: ReadonlySet<Capability> },
): boolean {
  return offeredBy(indexEntryOf(slug), options);
}

export type TemplateListing = {
  slug: TemplateSlug;
  name: string;
  summary: string;
  translated: boolean;
  status: TemplateIndexLocale["status"] | null;
  publicPage: TemplateIndexLocale["publicPage"] | null;
  offered: boolean;
};

export function listTemplates(options: {
  locale: string;
  publishedOnly?: boolean;
  deployment?: TemplateDeployment;
  shipped?: ReadonlySet<Capability>;
}): TemplateListing[] {
  const deployment = options.deployment ?? "cloud";
  return TEMPLATE_SLUGS.map((slug) => {
    const entry = indexEntryOf(slug);
    const own = entry.locales[options.locale];
    const shown = own ?? entry.locales[DEFAULT_LOCALE];
    if (!shown) throw new Error(`Template ${slug} has no ${DEFAULT_LOCALE} text`);
    return {
      slug,
      name: shown.name,
      summary: shown.summary,
      translated: own !== undefined,
      status: own?.status ?? null,
      publicPage: own?.publicPage ?? null,
      offered: offeredBy(entry, { deployment, shipped: options.shipped }),
    };
  }).filter((listing) => !options.publishedOnly || (listing.status === "published" && listing.offered));
}
