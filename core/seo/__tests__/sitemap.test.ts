import type { ContentLocale } from "@/i18n/locale-registry";
import type { LocalizedRoute } from "../sitemap";

import { describe, expect, it } from "vitest";

import { buildAlternateLanguages } from "../alternates";
import { assembleSitemap, resolvePageLastModified } from "../sitemap";

import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

const BASE_URL = "https://example.test";

const PARTIALLY_TRANSLATED_CONTENT_LOCALE = "yy" as ContentLocale;
const APPLICATION_ONLY_LOCALE = "zz" as ContentLocale;

function route(locale: ContentLocale, routePath: string): LocalizedRoute {
  return { locale, routePath };
}

function urls(entries: ReturnType<typeof assembleSitemap>): string[] {
  return entries.map((entry) => entry.url);
}

describe("sitemap assembly", () => {
  it("emits one url per locale that actually has the page", () => {
    const entries = assembleSitemap(
      [route("en", "/pricing"), route("de", "/pricing"), route("en", "/blog/only-english")],
      BASE_URL,
    );

    expect(urls(entries)).toEqual([
      `${BASE_URL}/en/pricing`,
      `${BASE_URL}/de/pricing`,
      `${BASE_URL}/en/blog/only-english`,
    ]);
  });

  it("never emits a locale that has no page", () => {
    const entries = assembleSitemap([route("en", "/pricing"), route("de", "/pricing")], BASE_URL);

    expect(urls(entries).some((url) => url.includes(`/${APPLICATION_ONLY_LOCALE}/`))).toBe(false);
    expect(JSON.stringify(entries)).not.toContain(APPLICATION_ONLY_LOCALE);
  });

  it("lists only translated locales in the alternate set", () => {
    const entries = assembleSitemap(
      [
        route("en", "/pricing"),
        route("de", "/pricing"),
        route(PARTIALLY_TRANSLATED_CONTENT_LOCALE, "/pricing"),
        route("en", "/blog/only-english"),
      ],
      BASE_URL,
    );

    const pricing = entries.find((entry) => entry.url === `${BASE_URL}/en/pricing`);
    expect(Object.keys(pricing?.alternates?.languages ?? {}).sort()).toEqual(
      ["de", "en", "x-default", PARTIALLY_TRANSLATED_CONTENT_LOCALE].sort(),
    );

    const onlyEnglish = entries.find((entry) => entry.url === `${BASE_URL}/en/blog/only-english`);
    expect(onlyEnglish?.alternates, "a single-locale page must not advertise a one-entry hreflang set").toBeUndefined();
  });

  it("keeps every alternate target present in the sitemap", () => {
    const entries = assembleSitemap(
      [route("en", "/pricing"), route("de", "/pricing"), route("en", "/blog/only-english")],
      BASE_URL,
    );

    const emitted = new Set(urls(entries));

    for (const entry of entries) {
      for (const [language, href] of Object.entries(entry.alternates?.languages ?? {})) {
        if (language === "x-default") continue;
        expect(emitted.has(href as string), `hreflang ${language} -> ${href as string} is not in the sitemap`).toBe(
          true,
        );
      }
    }
  });

  it("makes the alternate sets reciprocal", () => {
    const entries = assembleSitemap([route("en", "/pricing"), route("de", "/pricing")], BASE_URL);

    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    for (const entry of entries) {
      for (const [language, href] of Object.entries(entry.alternates?.languages ?? {})) {
        if (language === "x-default") continue;
        const counterpart = byUrl.get(href as string);
        expect(counterpart?.alternates?.languages, `${href as string} must list alternates back`).toEqual(
          entry.alternates?.languages,
        );
      }
    }
  });

  it("omits lastmod entirely when the page declares no date", () => {
    const modified = new Date("2025-05-05T05:05:05.000Z");
    const entries = assembleSitemap(
      [{ locale: "en", routePath: "/pricing", lastModified: modified }, route("de", "/pricing")],
      BASE_URL,
    );

    expect(entries[0].lastModified).toBe(modified);
    expect(
      "lastModified" in entries[1],
      "a stamped-at-build lastmod tells Google every page changed at deploy time, which teaches it to ignore the field",
    ).toBe(false);
  });
});

describe("sitemap page dates", () => {
  it("prefers the Git-derived modification time over the original publication date", () => {
    const modified = new Date("2026-08-28T10:00:00.000Z");

    expect(
      resolvePageLastModified({
        blogPost: { date: "2026-03-01" },
        lastModified: modified,
      }),
    ).toBe(modified);
  });

  it("uses a valid publication date only when no derived modification time exists", () => {
    expect(resolvePageLastModified({ blogPost: { date: "2026-03-01" } })?.toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(resolvePageLastModified({ blogPost: { date: "not-a-date" } })).toBeUndefined();
  });
});

describe("alternate languages", () => {
  it("omits x-default when the default locale has no translation", () => {
    const languages = buildAlternateLanguages("/pricing", ["de", PARTIALLY_TRANSLATED_CONTENT_LOCALE], BASE_URL);

    expect(languages).toBeDefined();
    expect(languages).not.toHaveProperty("x-default");
    expect(Object.keys(languages ?? {}).sort()).toEqual(["de", PARTIALLY_TRANSLATED_CONTENT_LOCALE].sort());
  });

  it("returns nothing below two locales", () => {
    expect(buildAlternateLanguages("/pricing", ["en"], BASE_URL)).toBeUndefined();
    expect(buildAlternateLanguages("/pricing", [], BASE_URL)).toBeUndefined();
  });

  it("keeps the locale root path free of a trailing segment", () => {
    const languages = buildAlternateLanguages("/", [DEFAULT_LOCALE, "de"], BASE_URL);

    expect(languages).toEqual({
      en: `${BASE_URL}/en`,
      de: `${BASE_URL}/de`,
      "x-default": `${BASE_URL}/en`,
    });
  });

  it("preserves a query string in localized pagination alternates", () => {
    expect(buildAlternateLanguages("/blog?page=2", CONTENT_LOCALES, BASE_URL)).toEqual({
      de: `${BASE_URL}/de/blog?page=2`,
      en: `${BASE_URL}/en/blog?page=2`,
      "x-default": `${BASE_URL}/en/blog?page=2`,
    });
  });
});
