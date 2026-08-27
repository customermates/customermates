import { describe, expect, it } from "vitest";

import { aggregateOfferSchema, markdownToPlainText } from "../schemas";

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

describe("markdownToPlainText", () => {
  it("removes inline Markdown syntax from FAQ schema answers", () => {
    expect(
      markdownToPlainText(
        "Use [the inbox](/docs/app-inbox), **review** the _draft_, run `send_email`, and ~~discard~~ revise it.",
      ),
    ).toBe("Use the inbox, review the draft, run send_email, and discard revise it.");
  });
});
