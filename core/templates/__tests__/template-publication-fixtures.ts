import type { Capability } from "@/core/capabilities/capabilities";
import type { TemplateIndex, TemplateIndexEntry, TemplateIndexLocale } from "@/core/templates/template-index.types";

export const ALL_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "forms",
  "rules",
  "calendarWrite",
  "notifications",
  "incomingWebhooks",
]);

const PAGE = {
  metaDescription: "A description that is long enough to read as a real search snippet for the fixture page.",
  metaTitle: "Fixture template title for tests",
};

export function localeOf(overrides: Partial<TemplateIndexLocale> = {}): TemplateIndexLocale {
  return {
    name: "Fixture template",
    page: PAGE,
    publicPage: "own",
    status: "published",
    summary: "A short summary of the fixture template.",
    ...overrides,
  };
}

export function entryOf(slug: string, overrides: Partial<TemplateIndexEntry> = {}): TemplateIndexEntry {
  return {
    counts: { fields: 10, lists: 2, rules: 3, views: 4, widgets: 5 },
    family: "clients",
    kind: "tracker",
    locales: { de: localeOf(), en: localeOf() },
    pairedPages: { de: "/features/contact-management", en: "/features/contact-management" },
    requiresCapabilities: [],
    reviewedAt: "2026-11-12",
    slug,
    ...overrides,
  };
}

export function indexOf(...entries: TemplateIndexEntry[]): TemplateIndex {
  return entries;
}
