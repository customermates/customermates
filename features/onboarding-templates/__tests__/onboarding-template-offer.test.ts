import { describe, expect, it } from "vitest";

import type { Capability } from "@/core/capabilities/capabilities";
import type { TemplateIndex } from "@/core/templates/template-index.types";

import { CAPABILITIES } from "@/core/capabilities/capabilities";
import { getTemplateIndex } from "@/core/templates/template-index";
import { isTemplateOffered } from "@/core/templates/template-registry";
import { TEMPLATE_SLUGS } from "@/core/templates/template-slugs";

import {
  DEFAULT_ONBOARDING_TEMPLATE,
  offeredTemplateCards,
  preselectOnboardingTemplate,
} from "../onboarding-template-offer";

const ALL: ReadonlySet<Capability> = new Set(CAPABILITIES);
const NONE: ReadonlySet<Capability> = new Set();

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
      en: { name: `${slug} en`, summary: `${slug} summary`, status: "draft", publicPage: "own", page: null },
      de: { name: `${slug} de`, summary: `${slug} Zusammenfassung`, status: "draft", publicPage: "own", page: null },
    },
    ...over,
  };
}

describe("offered template cards", () => {
  it("offers the same templates as the registry for every deployment and shipped set", () => {
    const shippedSets = [NONE, ALL, new Set<Capability>(["rules", "notifications"]), new Set<Capability>(["forms"])];
    for (const shipped of shippedSets) {
      for (const deployment of ["cloud", "self-hosted"] as const) {
        const cards = offeredTemplateCards({ locale: "en", deployment, shipped }).map((card) => card.slug);
        const registry = TEMPLATE_SLUGS.filter((slug) => isTemplateOffered(slug, { deployment, shipped }));
        expect(cards, `${deployment} with ${[...shipped].join(",") || "nothing shipped"}`).toEqual(registry);
      }
    }
  });

  it("offers nothing while the capabilities of the templates are not shipped", () => {
    expect(offeredTemplateCards({ locale: "en", deployment: "cloud", shipped: NONE })).toEqual([]);
  });

  it("keeps cloud-only capabilities away from self-hosted instances", () => {
    const index = [
      entry("sales-pipeline"),
      entry("real-estate-pipeline", { requiresCapabilities: ["calendarWrite"] }),
    ] satisfies TemplateIndex;

    expect(offeredTemplateCards({ locale: "en", deployment: "cloud", shipped: ALL, index }).map((c) => c.slug)).toEqual(
      ["sales-pipeline", "real-estate-pipeline"],
    );
    expect(
      offeredTemplateCards({ locale: "en", deployment: "self-hosted", shipped: ALL, index }).map((c) => c.slug),
    ).toEqual(["sales-pipeline"]);
  });

  it("uses the text of the locale and falls back to English for a locale without text", () => {
    const index = [entry("sales-pipeline")] satisfies TemplateIndex;

    expect(offeredTemplateCards({ locale: "de", deployment: "cloud", shipped: ALL, index })[0]).toMatchObject({
      name: "sales-pipeline de",
      summary: "sales-pipeline Zusammenfassung",
    });
    expect(offeredTemplateCards({ locale: "fr", deployment: "cloud", shipped: ALL, index })[0]).toMatchObject({
      name: "sales-pipeline en",
    });
  });

  it("carries the counts a card shows and nothing from the spec", () => {
    const [card] = offeredTemplateCards({
      locale: "en",
      deployment: "cloud",
      shipped: ALL,
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
    expect(offeredTemplateCards({ locale: "en", deployment: "cloud", shipped: ALL, index: [entry("unknown")] })).toEqual(
      [],
    );
  });

  it("offers every real template with text in the locale once its capabilities ship", () => {
    const cards = offeredTemplateCards({ locale: "en", deployment: "cloud", shipped: ALL });

    expect(cards.map((card) => card.slug)).toEqual([...getTemplateIndex().map((e) => e.slug)]);
    for (const card of cards) {
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.summary.length).toBeGreaterThan(0);
    }
  });
});

describe("template preselection", () => {
  const index = [
    entry("sales-pipeline"),
    entry("client-tracker", { family: "clients", pairedPages: { en: "/for/consultants", de: "/for/berater" } }),
    entry("real-estate-pipeline", { family: "property", pairedPages: { en: "/for/real-estate" } }),
  ] satisfies TemplateIndex;
  const cards = offeredTemplateCards({ locale: "en", deployment: "cloud", shipped: ALL, index });

  it("prefers the template chosen on the website sign-up link", () => {
    expect(
      preselectOnboardingTemplate({
        cards,
        signupTemplate: "real-estate-pipeline",
        landingPath: "/en/for/consultants",
        index,
      }),
    ).toEqual({ slug: "real-estate-pipeline", reason: "signup" });
  });

  it("falls back to the template paired with the page the sign-up started from, in that page's language", () => {
    expect(
      preselectOnboardingTemplate({ cards, signupTemplate: null, landingPath: "/en/for/consultants", index }),
    ).toEqual({ slug: "client-tracker", reason: "page" });
    expect(
      preselectOnboardingTemplate({ cards, signupTemplate: null, landingPath: "/de/for/berater", index }),
    ).toEqual({ slug: "client-tracker", reason: "page" });
  });

  it("recommends the default template when nothing points at another one", () => {
    expect(preselectOnboardingTemplate({ cards, signupTemplate: null, landingPath: "/en/pricing", index })).toEqual({
      slug: DEFAULT_ONBOARDING_TEMPLATE,
      reason: "default",
    });
    expect(preselectOnboardingTemplate({ cards, signupTemplate: null, landingPath: null, index }).reason).toBe(
      "default",
    );
  });

  it("ignores a signup template that is not offered and a page that pairs with a template that is not offered", () => {
    const some = cards.filter((card) => card.slug === "client-tracker");

    expect(
      preselectOnboardingTemplate({ cards: some, signupTemplate: "real-estate-pipeline", landingPath: null, index }),
    ).toEqual({ slug: "client-tracker", reason: "default" });
    expect(
      preselectOnboardingTemplate({ cards: some, signupTemplate: null, landingPath: "/en/for/real-estate", index }),
    ).toEqual({ slug: "client-tracker", reason: "default" });
  });

  it("preselects nothing when no template is offered", () => {
    expect(preselectOnboardingTemplate({ cards: [], signupTemplate: "client-tracker", landingPath: null, index })).toEqual(
      { slug: null, reason: null },
    );
  });

  it("ignores a forged signup template value", () => {
    expect(
      preselectOnboardingTemplate({ cards, signupTemplate: "../../etc/passwd", landingPath: null, index }).reason,
    ).toBe("default");
  });
});
