import type { Capability } from "@/core/capabilities/capabilities";
import type { TemplateIndex, TemplateIndexEntry, TemplateIndexLocale } from "./template-index.types";

import { SHIPPED_CAPABILITIES } from "@/core/capabilities/capabilities";

import { getTemplateIndex } from "./template-index";

export type TemplateDeploymentKind = "cloud" | "self-hosted";

export type TemplatePublicationOptions = {
  index?: TemplateIndex;
  shipped?: ReadonlySet<Capability>;
  deployment?: TemplateDeploymentKind;
};

export type TemplateVisibility = "own" | "proof" | "block" | "hidden";

export type HubVisibility = "indexable" | "noindex" | "hidden";

export type VisibleTemplate = {
  entry: TemplateIndexEntry;
  locale: TemplateIndexLocale;
  visibility: TemplateVisibility;
};

const CLOUD_ONLY: ReadonlySet<Capability> = new Set<Capability>(["calendarWrite"]);

function offered(entry: TemplateIndexEntry, options: TemplatePublicationOptions): boolean {
  const shipped = options.shipped ?? SHIPPED_CAPABILITIES;
  const deployment = options.deployment ?? "cloud";
  return entry.requiresCapabilities.every(
    (capability) => shipped.has(capability) && (deployment === "cloud" || !CLOUD_ONLY.has(capability)),
  );
}

export function templateVisibility(
  entry: TemplateIndexEntry,
  locale: string,
  options: TemplatePublicationOptions = {},
): TemplateVisibility {
  const text = entry.locales[locale];
  if (!text || text.status !== "published" || !offered(entry, options)) return "hidden";
  if (text.publicPage === "none") return "block";
  return text.page ? text.publicPage : "hidden";
}

function visible(locale: string, options: TemplatePublicationOptions): VisibleTemplate[] {
  return (options.index ?? getTemplateIndex()).flatMap((entry) => {
    const visibility = templateVisibility(entry, locale, options);
    const text = entry.locales[locale];
    return visibility === "hidden" || !text ? [] : [{ entry, locale: text, visibility }];
  });
}

export function pageTemplates(locale: string, options: TemplatePublicationOptions = {}): VisibleTemplate[] {
  return visible(locale, options).filter((item) => item.visibility === "own" || item.visibility === "proof");
}

export function ownPageSlugs(locale: string, options: TemplatePublicationOptions = {}): string[] {
  return visible(locale, options)
    .filter((item) => item.visibility === "own")
    .map((item) => item.entry.slug);
}

export function hubVisibility(locale: string, options: TemplatePublicationOptions = {}): HubVisibility {
  const pages = pageTemplates(locale, options);
  if (pages.length === 0) return "hidden";
  return pages.some((item) => item.visibility === "own") ? "indexable" : "noindex";
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
  return locales.filter((locale) => templateVisibility(entry, locale, options) === "own");
}
