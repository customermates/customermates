import { describe, expect, it } from "vitest";

import { assembleSitemap } from "@/core/seo/sitemap";
import { createTemplatesSources } from "@/core/templates/templates-source";

import { ALL_CAPABILITIES, entryOf, indexOf, localeOf } from "./template-publication-fixtures";

const index = indexOf(
  entryOf("tracker", {
    locales: {
      de: localeOf({ publicPage: "own" }),
      en: localeOf({ publicPage: "own" }),
      fr: localeOf({ publicPage: "proof" }),
      it: localeOf({ status: "draft" }),
    },
    reviewedAt: "2026-11-10",
  }),
  entryOf("pipeline", { locales: { en: localeOf({ publicPage: "proof" }) }, reviewedAt: "2026-11-12" }),
);

describe("templates route sources", () => {
  const { hub, pages } = createTemplatesSources({ index, shipped: ALL_CAPABILITIES });

  it("serves only own pages as sitemap pages", () => {
    expect(pages.getPages("en").map((page) => page.url)).toEqual(["/en/templates/tracker"]);
    expect(pages.getPages("fr")).toEqual([]);
    expect(pages.getPages("it")).toEqual([]);
  });

  it("answers a slug lookup only for an own page, so hreflang never lists a proof or draft locale", () => {
    expect(pages.getPage(["tracker"], "de")?.slugs).toEqual(["tracker"]);
    expect(pages.getPage(["tracker"], "fr")).toBeUndefined();
    expect(pages.getPage(["pipeline"], "en")).toBeUndefined();
    expect(pages.getPage(["missing"], "en")).toBeUndefined();
  });

  it("dates a page by the day its practice was last reviewed", () => {
    expect(pages.getPage(["tracker"], "en")?.data.lastModified?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("carries the page meta text", () => {
    expect(pages.getPage(["tracker"], "en")?.data.title).toBe("Fixture template title for tests");
  });

  it("serves the hub only where an own page makes it indexable", () => {
    expect(hub.getPage(["templates"], "en")?.url).toBe("/en/templates");
    expect(hub.getPage(["templates"], "fr")).toBeUndefined();
    expect(hub.getPages("it")).toEqual([]);
  });

  it("dates the hub by its newest own page", () => {
    expect(hub.getPage(["templates"], "en")?.data.lastModified?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("gives nothing to the sitemap while every locale is a draft", () => {
    const draft = createTemplatesSources({
      index: indexOf(entryOf("a", { locales: { en: localeOf({ status: "draft" }) } })),
      shipped: ALL_CAPABILITIES,
    });
    expect(draft.hub.getPages("en")).toEqual([]);
    expect(draft.pages.getPages("en")).toEqual([]);
  });
});

describe("templates in the sitemap", () => {
  it("lists each own page with hreflang across the own locales plus x-default", () => {
    const { pages } = createTemplatesSources({ index, shipped: ALL_CAPABILITIES });
    const routes = (["en", "de"] as const).flatMap((locale) =>
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
