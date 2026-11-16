import type { Capability } from "@/core/capabilities/capabilities";
import type { TemplateIndex, TemplateIndexEntry, TemplateIndexLocale } from "./template-index.types";

import { getTemplateIndex } from "./template-index";

export type TemplateDeployment = "cloud" | "self-hosted";

export type TemplatePublicationOptions = {
  index?: TemplateIndex;
  deployment?: TemplateDeployment;
};

export type TemplateVisibility = TemplateIndexLocale["publication"] | "hidden";

export type HubVisibility = "indexable" | "noindex" | "hidden";

export type VisibleTemplate = {
  entry: TemplateIndexEntry;
  locale: TemplateIndexLocale;
  visibility: Exclude<TemplateVisibility, "hidden">;
};

const CLOUD_ONLY_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(["calendarWrite"]);

export function isTemplateOffered(
  entry: Pick<TemplateIndexEntry, "requiresCapabilities">,
  deployment: TemplateDeployment,
): boolean {
  return (
    deployment === "cloud" || !entry.requiresCapabilities.some((capability) => CLOUD_ONLY_CAPABILITIES.has(capability))
  );
}

export function templateVisibility(
  entry: TemplateIndexEntry,
  locale: string,
  options: TemplatePublicationOptions = {},
): TemplateVisibility {
  const text = entry.locales[locale];
  return text && isTemplateOffered(entry, options.deployment ?? "cloud") ? text.publication : "hidden";
}

function visible(locale: string, options: TemplatePublicationOptions): VisibleTemplate[] {
  return (options.index ?? getTemplateIndex()).flatMap((entry) => {
    const visibility = templateVisibility(entry, locale, options);
    const text = entry.locales[locale];
    return visibility === "hidden" || !text ? [] : [{ entry, locale: text, visibility }];
  });
}

export function pageTemplates(locale: string, options: TemplatePublicationOptions = {}): VisibleTemplate[] {
  return visible(locale, options).filter((item) => item.visibility !== "none");
}

export function indexedPageSlugs(locale: string, options: TemplatePublicationOptions = {}): string[] {
  return visible(locale, options)
    .filter((item) => item.visibility === "indexed")
    .map((item) => item.entry.slug);
}

export function hubVisibility(locale: string, options: TemplatePublicationOptions = {}): HubVisibility {
  const pages = pageTemplates(locale, options);
  if (pages.length === 0) return "hidden";
  return pages.some((item) => item.visibility === "indexed") ? "indexable" : "noindex";
}

export function templatesPairedWith(
  locale: string,
  path: string,
  options: TemplatePublicationOptions = {},
): VisibleTemplate[] {
  return visible(locale, options).filter((item) => item.entry.pairedPages[locale] === path);
}

export function templateVisibilityBySlug(
  slug: string,
  locale: string,
  options: TemplatePublicationOptions = {},
): VisibleTemplate | null {
  return visible(locale, options).find((item) => item.entry.slug === slug) ?? null;
}

export function indexableLocales<Locale extends string>(
  slug: string,
  locales: readonly Locale[],
  options: TemplatePublicationOptions = {},
): Locale[] {
  const index = options.index ?? getTemplateIndex();
  const entry = index.find((candidate) => candidate.slug === slug);
  if (!entry) return [];
  return locales.filter((locale) => templateVisibility(entry, locale, options) === "indexed");
}
