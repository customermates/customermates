import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { aggregateOfferSchema } from "../schemas";

import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";
import { REPO_ROOT } from "@/tests/conventions/walk";

function pricesFromPricingContent(locale: string): string[] {
  const raw = readFileSync(join(REPO_ROOT, "content", "pricing", locale, "pricing.mdx"), "utf8");
  return [...raw.matchAll(/^\s*price:\s*"(\d+)"\s*$/gm)].map((match) => match[1]);
}

describe("aggregateOfferSchema", () => {
  it("spans the cheapest and dearest plan", () => {
    const offer = aggregateOfferSchema({ prices: ["12", "29", "69"], locale: DEFAULT_LOCALE });

    expect(offer).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "12",
      highPrice: "69",
      offerCount: "3",
      priceCurrency: "EUR",
    });
  });

  it("omits the offer block rather than advertising a guess", () => {
    expect(aggregateOfferSchema({ prices: [], locale: DEFAULT_LOCALE })).toBeUndefined();
    expect(aggregateOfferSchema({ prices: ["Free", "0"], locale: DEFAULT_LOCALE })).toBeUndefined();
  });

  it("matches the prices the pricing page actually renders, in every content locale", () => {
    for (const locale of CONTENT_LOCALES) {
      const prices = pricesFromPricingContent(locale);
      expect(prices.length, `pricing.mdx for ${locale} should list plan prices`).toBeGreaterThan(0);

      const offer = aggregateOfferSchema({ prices, locale });
      const amounts = prices.map(Number);

      expect(offer?.lowPrice, `lowPrice for ${locale}`).toBe(String(Math.min(...amounts)));
      expect(offer?.highPrice, `highPrice for ${locale}`).toBe(String(Math.max(...amounts)));
    }
  });
});
