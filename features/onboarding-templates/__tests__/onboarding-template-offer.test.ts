import { describe, expect, it } from "vitest";

import type { TemplateIndex } from "@/core/templates/template-index.types";

import { getTemplateIndex } from "@/core/templates/template-index";
import { listOfferedTemplates } from "@/core/templates/template-registry";

import { offeredTemplateCards } from "../onboarding-template-offer";

function entry(slug: string, over: Partial<TemplateIndex[number]> = {}): TemplateIndex[number] {
  return {
    slug,
    family: "sales",
    kind: "pipeline",
    requiresCapabilities: [],
    pairedPages: {},
    reviewedAt: "2026-11-12",
    counts: { lists: 3, fields: 20, views: 4, widgets: 6, rules: 2 },
    locales: {
      en: {
        name: `${slug} en`,
        summary: `${slug} summary`,
        publication: "none",
        page: null,
      },
      de: {
        name: `${slug} de`,
        summary: `${slug} Zusammenfassung`,
        publication: "none",
        page: null,
      },
    },
    ...over,
  };
}

describe("offered template cards", () => {
  it("offers the same templates as the registry for every deployment", () => {
    for (const deployment of ["cloud", "self-hosted"] as const) {
      const cards = offeredTemplateCards({ locale: "en", deployment }).map((card) => card.slug);
      const registry = listOfferedTemplates({ locale: "en", deployment }).map((listing) => listing.slug);
      expect(cards, deployment).toEqual(registry);
    }
  });

  it("keeps cloud-only capabilities away from self-hosted instances", () => {
    const index = [
      entry("sales-pipeline"),
      entry("real-estate-pipeline", { requiresCapabilities: ["calendarWrite"] }),
    ] satisfies TemplateIndex;

    expect(offeredTemplateCards({ locale: "en", deployment: "cloud", index }).map((c) => c.slug)).toEqual([
      "sales-pipeline",
      "real-estate-pipeline",
    ]);
    expect(offeredTemplateCards({ locale: "en", deployment: "self-hosted", index }).map((c) => c.slug)).toEqual([
      "sales-pipeline",
    ]);
  });

  it("uses the text of the locale and falls back to English for a locale without text", () => {
    const index = [entry("sales-pipeline")] satisfies TemplateIndex;

    expect(offeredTemplateCards({ locale: "de", deployment: "cloud", index })[0]).toMatchObject({
      name: "sales-pipeline de",
      summary: "sales-pipeline Zusammenfassung",
    });
    expect(offeredTemplateCards({ locale: "fr", deployment: "cloud", index })[0]).toMatchObject({
      name: "sales-pipeline en",
    });
  });

  it("carries the counts a card shows and nothing from the spec", () => {
    const [card] = offeredTemplateCards({
      locale: "en",
      deployment: "cloud",
      index: [entry("sales-pipeline")],
    });

    expect(card).toEqual({
      slug: "sales-pipeline",
      family: "sales",
      name: "sales-pipeline en",
      summary: "sales-pipeline summary",
      counts: { lists: 3, views: 4, rules: 2 },
    });
  });

  it("drops a template whose slug the library does not know", () => {
    expect(offeredTemplateCards({ locale: "en", deployment: "cloud", index: [entry("unknown")] })).toEqual([]);
  });

  it("offers every real template with text in the locale in the cloud", () => {
    const cards = offeredTemplateCards({ locale: "en", deployment: "cloud" });

    expect(cards.map((card) => card.slug)).toEqual([...getTemplateIndex().map((e) => e.slug)]);
    for (const card of cards) {
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.summary.length).toBeGreaterThan(0);
    }
  });
});
