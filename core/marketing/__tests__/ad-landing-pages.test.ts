import { describe, expect, it, vi } from "vitest";

import type { env } from "@/env";

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<{ env: typeof env }>();
  return { env: { ...actual.env, BASE_URL: "https://customermates.com" } };
});

import { resolveCommercialTokensDeep, unresolvedCommercialTokens } from "@/core/commercial/commercial-tokens";
import {
  AD_LANDING_ROUTES,
  PUBLIC_ROUTES,
  SITEMAP_CONTENT_ROUTES,
  SITEMAP_EXTRA_CONTENT_ROUTES,
  isAdLandingPathname,
  isContentPathname,
  isPublicPathname,
} from "@/i18n/routing";

import { adLandingMetadata } from "../ad-landing-metadata";
import {
  AD_LANDING_AUDIENCE,
  AD_LANDING_CTA,
  AD_LANDING_CTA_DESCRIPTION,
  AD_LANDING_CTA_HINT,
  AD_LANDING_DEMO_HREF,
  AD_LANDING_PAGES,
  AD_LANDING_PLANS,
  AD_LANDING_PRICE_UNIT,
  AD_LANDING_SELF_HOST_LABEL,
  AD_LANDING_SIGNUP_HREF,
  AD_LANDING_SLUGS,
  adLandingPath,
} from "../ad-landing-pages";

const FORBIDDEN = [/open[ -]?source/iu, /dsgvo/iu, /eu-hosting/iu, /\bsterne?\b/iu, /bewertung/iu];

const EXPECTED_PATHS = [
  "/de/lp/crm-system",
  "/de/lp/crm-software",
  "/de/lp/vertrieb",
  "/de/lp/angebote-nachfassen",
  "/de/lp/statt-excel",
  "/de/lp/kundendatenbank",
  "/de/lp/crm-deutschland",
  "/de/lp/preise",
];

function plain(value: string): string {
  return value.replace(/[  ]/gu, " ");
}

function allText(): string[] {
  return [
    AD_LANDING_AUDIENCE,
    AD_LANDING_CTA,
    AD_LANDING_CTA_DESCRIPTION,
    AD_LANDING_CTA_HINT,
    AD_LANDING_PRICE_UNIT,
    AD_LANDING_SELF_HOST_LABEL,
    ...AD_LANDING_PLANS.flatMap((plan) => [plan.name, plan.price, plan.note]),
    ...Object.values(AD_LANDING_PAGES).flatMap((page) => [
      page.h1,
      page.lede,
      page.title,
      page.description,
      page.captureAlt,
      page.proofTitle,
      page.ctaTitle,
      ...page.proof.flatMap((item) => [item.title, item.text]),
      ...page.faq.flatMap((item) => [item.question, item.answer]),
    ]),
  ];
}

describe("Google Search ad landing pages", () => {
  it("has the eight agreed pages under /de/lp, one per German ad group", () => {
    expect(AD_LANDING_SLUGS.map(adLandingPath)).toEqual(EXPECTED_PATHS);
    expect(AD_LANDING_SLUGS.map((slug) => AD_LANDING_PAGES[slug].adGroup)).toEqual([
      "CRM System",
      "CRM Software",
      "Vertrieb",
      "Angebote nachfassen",
      "Excel und Notion",
      "Kontakte und Adressen",
      "Hosting EU",
      "Salesforce Kosten",
    ]);
  });

  it("repeats each ad's first headline in the H1", () => {
    const h1 = resolveCommercialTokensDeep(
      AD_LANDING_SLUGS.map((slug) => AD_LANDING_PAGES[slug].h1),
      "de",
    ).map(plain);
    expect(h1).toEqual([
      "CRM-System für kleine Teams",
      "CRM-Software für kleine Teams",
      "CRM für den Vertrieb kleiner Teams",
      "Angebote nachfassen im CRM",
      "Vom Excel-Blatt zum CRM",
      "Kundendatenbank für Teams",
      "CRM mit Datenbank in Frankfurt",
      "CRM ab 12 € pro Nutzer, Preise ohne Vertriebsgespräch",
    ]);
  });

  it("keeps every page scannable: four proof points and three to five questions", () => {
    for (const page of Object.values(AD_LANDING_PAGES)) {
      expect(page.proof).toHaveLength(4);
      expect(page.faq.length).toBeGreaterThanOrEqual(3);
      expect(page.faq.length).toBeLessThanOrEqual(5);
    }
  });

  it("states only the approved claims and resolves every commercial token", () => {
    for (const text of allText()) {
      for (const pattern of FORBIDDEN) expect(text, text).not.toMatch(pattern);
      expect(unresolvedCommercialTokens(resolveCommercialTokensDeep(text, "de")), text).toEqual([]);
    }
  });

  it("shows the live plan prices from the plan catalog", () => {
    const shown = resolveCommercialTokensDeep(AD_LANDING_PLANS, "de").map((plan) => [plan.name, plain(plan.price)]);
    expect(shown).toEqual([
      ["Starter", "12 €"],
      ["Pro", "29 €"],
      ["Business", "69 €"],
    ]);
    expect(resolveCommercialTokensDeep(AD_LANDING_CTA, "de")).toBe("14 Tage kostenlos testen");
  });

  it("sends both buttons to the cloud workspace signup and the secondary link to the public demo", () => {
    expect(AD_LANDING_SIGNUP_HREF).toBe("/de/auth/signup?job=workspace");
    expect(new URL(AD_LANDING_DEMO_HREF).host).toBe("demo.customermates.com");
  });
});

describe("ad landing routes", () => {
  it("are public, eligible for ad attribution and outside the content routes", () => {
    expect(AD_LANDING_ROUTES).toEqual(["/lp/:slug"]);
    expect(PUBLIC_ROUTES).toContain("/lp/:slug");
    for (const path of EXPECTED_PATHS) {
      expect(isPublicPathname(path), path).toBe(true);
      expect(isAdLandingPathname(path), path).toBe(true);
      expect(isContentPathname(path), path).toBe(false);
    }
    expect(isAdLandingPathname("/de/start/crm-system")).toBe(false);
  });

  it("are not part of the sitemap route lists", () => {
    const sitemapRoutes: readonly string[] = [...SITEMAP_CONTENT_ROUTES, ...SITEMAP_EXTRA_CONTENT_ROUTES];
    expect(sitemapRoutes.filter((route) => route.startsWith("/lp"))).toEqual([]);
  });

  it("are noindex, follow links, and carry no hreflang alternates", () => {
    for (const slug of AD_LANDING_SLUGS) {
      const metadata = adLandingMetadata(slug);
      expect(metadata.robots, slug).toEqual({ follow: true, index: false });
      expect(metadata.alternates, slug).toEqual({ canonical: `https://customermates.com${adLandingPath(slug)}` });
    }
  });
});
