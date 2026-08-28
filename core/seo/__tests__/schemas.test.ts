import { describe, expect, it } from "vitest";

import { aggregateOfferSchema, articleSchema, organizationSchema } from "../schemas";

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

describe("publisher logo", () => {
  it("uses the public logo asset for organization and article structured data", () => {
    const expected = `${organizationSchema().url}/images/light/customermates-square.svg`;

    expect(organizationSchema().logo).toBe(expected);
    expect(
      articleSchema({
        datePublished: "2026-08-26",
        description: "A sourced article",
        headline: "Agentic CRM",
        locale: "en",
        slug: "agentic-crm",
      }).publisher.logo.url,
    ).toBe(expected);
  });
});

describe("article images", () => {
  const params = {
    datePublished: "2026-08-26",
    description: "A sourced article",
    headline: "Agentic CRM",
    locale: "en",
    slug: "agentic-crm",
  };

  it("keeps the localized hero and generated social image by default", () => {
    expect(articleSchema(params).image).toHaveLength(2);
    expect(articleSchema(params).image[0]).toContain("/images/light/en/agentic-crm.png");
  });

  it("omits a suppressed hero from structured data", () => {
    const schema = articleSchema({ ...params, includeHeroImage: false });

    expect(schema.image).toHaveLength(1);
    expect(schema.image[0]).toContain("/og/image.png?");
    expect(schema.image[0]).not.toContain("/images/light/en/agentic-crm.png");
  });
});
