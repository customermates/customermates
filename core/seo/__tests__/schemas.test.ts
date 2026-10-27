import { describe, expect, it } from "vitest";

import { aggregateOfferSchema, articleSchema, organizationSchema, webPageSchema } from "../schemas";

import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

describe("aggregateOfferSchema", () => {
  it("spans the cheapest and dearest plan", () => {
    const offer = aggregateOfferSchema({ locale: DEFAULT_LOCALE });

    expect(offer).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "12",
      highPrice: "149",
      offerCount: "4",
      priceCurrency: "EUR",
    });
  });

  it("derives the same catalog range in every content locale", () => {
    for (const locale of CONTENT_LOCALES) {
      const offer = aggregateOfferSchema({ locale });

      expect(offer?.lowPrice, `lowPrice for ${locale}`).toBe("12");
      expect(offer?.highPrice, `highPrice for ${locale}`).toBe("149");
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

  it("declares the article's language from the locale it is served in", () => {
    expect(articleSchema(params).inLanguage).toBe("en");
    expect(articleSchema({ ...params, locale: "de" }).inLanguage).toBe("de");
  });

  it("dates the article's modification by its publication unless a later date is given", () => {
    expect(articleSchema(params).dateModified).toBe(params.datePublished);
    expect(articleSchema({ ...params, dateModified: "2026-09-01" }).dateModified).toBe("2026-09-01");
  });

  it("uses the generated social image without requiring a visible article hero", () => {
    const schema = articleSchema(params);

    expect(schema.image).toHaveLength(1);
    expect(schema.image[0]).toContain("/og/image.png?");
    expect(schema.image[0]).not.toContain("/images/light/en/agentic-crm.png");
  });
});

describe("webPageSchema", () => {
  const params = {
    name: "Monday vs Salesforce",
    description: "A comparison.",
    locale: "de",
    path: "/de/compare/monday-vs-salesforce",
  };

  it("identifies the page by its canonical URL and language", () => {
    const schema = webPageSchema(params);
    expect(schema["@id"]).toMatch(/\/de\/compare\/monday-vs-salesforce$/);
    expect(schema.url).toBe(schema["@id"]);
    expect(schema.inLanguage).toBe("de");
  });

  it("dates the page only when its modification date is known", () => {
    expect(webPageSchema(params)).not.toHaveProperty("dateModified");
    expect(
      webPageSchema({
        ...params,
        dateModified: new Date("2026-10-27T07:01:50Z"),
      }).dateModified,
    ).toBe("2026-10-27T07:01:50.000Z");
  });

  it("names Customermates as the publisher and the software the page is about", () => {
    const schema = webPageSchema(params);
    expect(schema.publisher.name).toBe("Customermates");
    expect(schema.about["@type"]).toBe("SoftwareApplication");
  });
});
