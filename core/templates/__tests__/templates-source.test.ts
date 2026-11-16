import { describe, expect, it } from "vitest";

import { assembleSitemap } from "@/core/seo/sitemap";
import { MARKETING_LOCALES } from "@/i18n/locale-registry";
import { createTemplatesSources } from "@/core/templates/templates-source";

import { entryOf, indexOf, localeOf } from "./template-publication-fixtures";

const index = indexOf(
  entryOf("tracker", {
    locales: {
      de: localeOf({ publication: "indexed" }),
      en: localeOf({ publication: "indexed" }),
      fr: localeOf({ publication: "noindex" }),
      it: localeOf({ publication: "none" }),
    },
    reviewedAt: "2026-11-10",
  }),
  entryOf("pipeline", { locales: { en: localeOf({ publication: "noindex" }) }, reviewedAt: "2026-11-12" }),
);

describe("templates route sources", () => {
  const { hub, pages } = createTemplatesSources({ index });

  it("serves only indexed pages as sitemap pages", () => {
    expect(pages.getPages("en").map((page) => page.url)).toEqual(["/en/templates/tracker"]);
    expect(pages.getPages("fr")).toEqual([]);
    expect(pages.getPages("it")).toEqual([]);
  });

  it("answers a slug lookup only for an indexed page, so hreflang never lists a noindex or page-less locale", () => {
    expect(pages.getPage(["tracker"], "de")?.slugs).toEqual(["tracker"]);
    expect(pages.getPage(["tracker"], "fr")).toBeUndefined();
    expect(pages.getPage(["tracker"], "it")).toBeUndefined();
    expect(pages.getPage(["pipeline"], "en")).toBeUndefined();
    expect(pages.getPage(["missing"], "en")).toBeUndefined();
  });

  it("dates a page by the day its practice was last reviewed", () => {
    expect(pages.getPage(["tracker"], "en")?.data.lastModified?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("carries the page meta text", () => {
    expect(pages.getPage(["tracker"], "en")?.data.title).toBe("Fixture template title for tests");
  });

  it("serves the hub only where an indexed page makes it indexable", () => {
    expect(hub.getPage(["templates"], "en")?.url).toBe("/en/templates");
    expect(hub.getPage(["templates"], "fr")).toBeUndefined();
    expect(hub.getPages("it")).toEqual([]);
  });

  it("dates the hub by its newest indexed page", () => {
    expect(hub.getPage(["templates"], "en")?.data.lastModified?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("gives nothing to the sitemap while no locale has an indexed page", () => {
    const quiet = createTemplatesSources({
      index: indexOf(entryOf("a", { locales: { en: localeOf({ publication: "noindex" }) } })),
    });
    expect(quiet.hub.getPages("en")).toEqual([]);
    expect(quiet.pages.getPages("en")).toEqual([]);
  });
});

describe("templates in the sitemap", () => {
  it("lists each indexed page with hreflang across the indexed locales plus x-default", () => {
    const { pages } = createTemplatesSources({ index });
    const routes = MARKETING_LOCALES.filter((locale) => locale === "en" || locale === "de").flatMap((locale) =>
      pages.getPages(locale).map((page) => ({ locale, routePath: `/templates/${page.slugs[0]}` })),
    );
    const entries = assembleSitemap(routes, "https://example.com");

    expect(entries.map((entry) => entry.url)).toEqual([
      "https://example.com/en/templates/tracker",
      "https://example.com/de/templates/tracker",
    ]);
    expect(entries[0].alternates?.languages).toEqual({
      de: "https://example.com/de/templates/tracker",
      en: "https://example.com/en/templates/tracker",
      "x-default": "https://example.com/en/templates/tracker",
    });
  });
});
