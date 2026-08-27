import { describe, expect, it } from "vitest";

import { aggregateOfferSchema } from "../schemas";

import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

describe("aggregateOfferSchema", () => {
  it("spans the cheapest and dearest plan", () => {
    const offer = aggregateOfferSchema({ locale: DEFAULT_LOCALE });

    expect(offer).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "12",
      highPrice: "69",
      offerCount: "3",
      priceCurrency: "EUR",
    });
  });

  it("derives the same catalog range in every content locale", () => {
    for (const locale of CONTENT_LOCALES) {
      const offer = aggregateOfferSchema({ locale });

      expect(offer?.lowPrice, `lowPrice for ${locale}`).toBe("12");
      expect(offer?.highPrice, `highPrice for ${locale}`).toBe("69");
    }
  });
});
