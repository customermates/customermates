import { describe, expect, it } from "vitest";

import { MARKETING_LOCALES } from "@/i18n/locale-registry";

import {
  hubVisibility,
  indexableLocales,
  indexedPageSlugs,
  isTemplateOffered,
  pageTemplates,
  templateVisibility,
  templateVisibilityBySlug,
  templatesPairedWith,
} from "@/core/templates/template-publication";

import { entryOf, indexOf, localeOf } from "./template-publication-fixtures";

describe("template visibility", () => {
  it("follows the publication of the locale: indexed, noindex or no page", () => {
    const entry = entryOf("a", {
      locales: {
        de: localeOf({ publication: "noindex" }),
        en: localeOf({ publication: "indexed" }),
        it: localeOf({ publication: "none" }),
      },
    });
    expect(templateVisibility(entry, "en")).toBe("indexed");
    expect(templateVisibility(entry, "de")).toBe("noindex");
    expect(templateVisibility(entry, "it")).toBe("none");
  });

  it("hides a locale without text", () => {
    expect(templateVisibility(entryOf("a"), "pl")).toBe("hidden");
  });

  it("hides a cloud-only capability from a self-hosted deployment", () => {
    const entry = entryOf("a", { requiresCapabilities: ["calendarWrite"] });
    expect(templateVisibility(entry, "en", { deployment: "cloud" })).toBe("indexed");
    expect(templateVisibility(entry, "en", { deployment: "self-hosted" })).toBe("hidden");
  });
});

describe("template offer", () => {
  it("offers every template in the cloud", () => {
    const needs = entryOf("a", { requiresCapabilities: ["forms", "rules", "calendarWrite", "incomingWebhooks"] });
    expect(isTemplateOffered(needs, "cloud")).toBe(true);
  });

  it("keeps the cloud-only capability out of a self-hosted deployment and offers the rest", () => {
    expect(isTemplateOffered({ requiresCapabilities: ["calendarWrite", "forms"] }, "self-hosted")).toBe(false);
    expect(isTemplateOffered({ requiresCapabilities: ["forms", "rules", "notifications"] }, "self-hosted")).toBe(true);
    expect(isTemplateOffered({ requiresCapabilities: [] }, "self-hosted")).toBe(true);
  });
});

describe("template listings", () => {
  const index = indexOf(
    entryOf("indexed-one", { locales: { en: localeOf({ publication: "indexed" }) } }),
    entryOf("noindex-one", {
      locales: { en: localeOf({ publication: "noindex" }) },
      pairedPages: { en: "/for/real-estate" },
    }),
    entryOf("none-one", {
      locales: { en: localeOf({ publication: "none" }) },
      pairedPages: { en: "/for/real-estate" },
    }),
  );
  const options = { index };

  it("lists indexed and noindex pages, never one without a page", () => {
    expect(pageTemplates("en", options).map((item) => item.entry.slug)).toEqual(["indexed-one", "noindex-one"]);
  });

  it("lists only indexed pages for the sitemap", () => {
    expect(indexedPageSlugs("en", options)).toEqual(["indexed-one"]);
  });

  it("finds the templates paired with a for or features page, those without a page included", () => {
    expect(templatesPairedWith("en", "/for/real-estate", options).map((item) => item.entry.slug)).toEqual([
      "noindex-one",
      "none-one",
    ]);
    expect(templatesPairedWith("en", "/for/recruiting", options)).toEqual([]);
  });

  it("resolves one slug with its visibility", () => {
    expect(templateVisibilityBySlug("noindex-one", "en", options)?.visibility).toBe("noindex");
    expect(templateVisibilityBySlug("none-one", "en", options)?.visibility).toBe("none");
    expect(templateVisibilityBySlug("missing", "en", options)).toBeNull();
  });

  it("names the locales in which a page is indexable", () => {
    const both = indexOf(
      entryOf("a", {
        locales: {
          de: localeOf({ publication: "indexed" }),
          en: localeOf({ publication: "noindex" }),
          fr: localeOf(),
          it: localeOf({ publication: "none" }),
        },
      }),
    );
    const locales = indexableLocales("a", MARKETING_LOCALES, { index: both });

    expect(locales).toHaveLength(2);
    expect(locales).toContain("de");
    expect(locales).toContain("fr");
    expect(locales).not.toContain("en");
    expect(locales).not.toContain("it");
  });
});

describe("hub visibility", () => {
  it("is hidden when no locale has a page", () => {
    const index = indexOf(entryOf("a", { locales: { en: localeOf({ publication: "none" }) } }));

    expect(hubVisibility("en", { index })).toBe("hidden");
  });

  it("is noindex when only noindex pages exist", () => {
    expect(
      hubVisibility("en", {
        index: indexOf(entryOf("a", { locales: { en: localeOf({ publication: "noindex" }) } })),
      }),
    ).toBe("noindex");
  });

  it("is indexable as soon as one indexed page exists", () => {
    expect(hubVisibility("en", { index: indexOf(entryOf("a")) })).toBe("indexable");
  });

  it("is decided per locale", () => {
    const index = indexOf(entryOf("a", { locales: { en: localeOf() } }));
    expect(hubVisibility("de", { index })).toBe("hidden");
  });
});
