import { describe, expect, it } from "vitest";

import { resolveCommercialTokensDeep, unresolvedCommercialTokens } from "@/core/commercial/commercial-tokens";

import {
  AD_LANDING_AUDIENCE,
  AD_LANDING_CTA,
  AD_LANDING_PAGES,
  AD_LANDING_PRICE_LINE,
  AD_LANDING_SIGNUP_HREF,
  AD_LANDING_SLUGS,
  adLandingPath,
} from "../ad-landing-pages";

const FORBIDDEN = [/open[ -]?source/iu, /dsgvo/iu, /eu-hosting/iu];

function plain(value: string): string {
  return value.replace(/[  ]/gu, " ");
}

function allText(): string[] {
  return [
    AD_LANDING_AUDIENCE,
    AD_LANDING_PRICE_LINE,
    AD_LANDING_CTA,
    ...Object.values(AD_LANDING_PAGES).flatMap((page) => [
      page.h1,
      page.title,
      page.description,
      ...page.points,
      ...page.faq.flatMap((item) => [item.question, item.answer]),
    ]),
  ];
}

describe("Google Search ad landing pages", () => {
  it("has the eight agreed pages under /de/start with the search in the H1", () => {
    expect(AD_LANDING_SLUGS.map(adLandingPath)).toEqual([
      "/de/start/crm-system",
      "/de/start/crm-software",
      "/de/start/vertrieb",
      "/de/start/angebote-nachfassen",
      "/de/start/statt-excel",
      "/de/start/kundendatenbank",
      "/de/start/crm-deutschland",
      "/de/start/preise",
    ]);
    const h1 = resolveCommercialTokensDeep(
      AD_LANDING_SLUGS.map((slug) => AD_LANDING_PAGES[slug].h1),
      "de",
    ).map(plain);
    expect(h1).toEqual([
      "CRM-System für kleine Teams",
      "CRM-Software für kleine Teams",
      "CRM für den Vertrieb",
      "Angebote nachfassen, ohne eines zu vergessen",
      "Vom Excel-Blatt zum CRM",
      "Kundendatenbank für Ihr Team",
      "CRM mit Datenbank in Frankfurt",
      "CRM ab 12 € pro Nutzer, Preise ohne Vertriebsgespräch",
    ]);
  });

  it("keeps every page short: three points and three questions", () => {
    for (const page of Object.values(AD_LANDING_PAGES)) {
      expect(page.points).toHaveLength(3);
      expect(page.faq).toHaveLength(3);
    }
  });

  it("states only the approved claims and resolves every commercial token", () => {
    for (const text of allText()) {
      for (const pattern of FORBIDDEN) expect(text, text).not.toMatch(pattern);
      expect(unresolvedCommercialTokens(resolveCommercialTokensDeep(text, "de")), text).toEqual([]);
    }
    expect(plain(resolveCommercialTokensDeep(AD_LANDING_PRICE_LINE, "de"))).toBe(
      "Starter 12 €, Pro 29 €, Business 69 € pro Nutzer und Monat, monatlich abgerechnet. Pro 14 Tage kostenlos testen, ohne Kreditkarte.",
    );
    expect(resolveCommercialTokensDeep(AD_LANDING_CTA, "de")).toBe("14 Tage kostenlos testen");
  });

  it("sends the one button to the workspace signup", () => {
    expect(AD_LANDING_SIGNUP_HREF).toBe("/de/auth/signup?job=workspace");
  });
});
