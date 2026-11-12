import { describe, expect, it } from "vitest";

import {
  hubVisibility,
  indexableLocales,
  ownPageSlugs,
  pageTemplates,
  templateVisibility,
  templateVisibilityBySlug,
  templatesPairedWith,
} from "@/core/templates/template-publication";

import { ALL_CAPABILITIES, entryOf, indexOf, localeOf } from "./template-publication-fixtures";

describe("template visibility", () => {
  it("keeps a draft locale hidden even when every capability has shipped", () => {
    const entry = entryOf("a", { locales: { en: localeOf({ status: "draft" }) } });
    expect(templateVisibility(entry, "en", { shipped: ALL_CAPABILITIES })).toBe("hidden");
  });

  it("keeps a reviewed locale hidden until it is published", () => {
    const entry = entryOf("a", { locales: { en: localeOf({ status: "reviewed" }) } });
    expect(templateVisibility(entry, "en", { shipped: ALL_CAPABILITIES })).toBe("hidden");
  });

  it("shows a published own page, a published proof page and a published block", () => {
    const entry = entryOf("a", {
      locales: {
        de: localeOf({ publicPage: "proof" }),
        en: localeOf({ publicPage: "own" }),
        fr: localeOf({ publicPage: "none" }),
      },
    });
    expect(templateVisibility(entry, "en")).toBe("own");
    expect(templateVisibility(entry, "de")).toBe("proof");
    expect(templateVisibility(entry, "fr")).toBe("block");
  });

  it("hides a page that has no page text, because it could not carry a title or description", () => {
    const entry = entryOf("a", {
      locales: { de: localeOf({ page: null, publicPage: "proof" }), en: localeOf({ page: null }) },
    });
    expect(templateVisibility(entry, "en")).toBe("hidden");
    expect(templateVisibility(entry, "de")).toBe("hidden");
  });

  it("hides a locale without text", () => {
    expect(templateVisibility(entryOf("a"), "pl")).toBe("hidden");
  });

  it("hides a template whose capability has not shipped", () => {
    const entry = entryOf("a", { requiresCapabilities: ["forms", "rules"] });
    expect(templateVisibility(entry, "en", { shipped: new Set(["forms"]) })).toBe("hidden");
    expect(templateVisibility(entry, "en", { shipped: new Set(["forms", "rules"]) })).toBe("own");
  });

  it("hides a cloud-only capability from a self-hosted deployment", () => {
    const entry = entryOf("a", { requiresCapabilities: ["calendarWrite"] });
    expect(templateVisibility(entry, "en", { deployment: "cloud", shipped: ALL_CAPABILITIES })).toBe("own");
    expect(templateVisibility(entry, "en", { deployment: "self-hosted", shipped: ALL_CAPABILITIES })).toBe("hidden");
  });
});

describe("template listings", () => {
  const index = indexOf(
    entryOf("own-one", { locales: { en: localeOf({ publicPage: "own" }) } }),
    entryOf("proof-one", {
      locales: { en: localeOf({ publicPage: "proof" }) },
      pairedPages: { en: "/for/real-estate" },
    }),
    entryOf("block-one", {
      locales: { en: localeOf({ publicPage: "none" }) },
      pairedPages: { en: "/for/real-estate" },
    }),
    entryOf("draft-one", { locales: { en: localeOf({ status: "draft" }) } }),
  );
  const options = { index, shipped: ALL_CAPABILITIES };

  it("lists own and proof pages, never a block or a draft", () => {
    expect(pageTemplates("en", options).map((item) => item.entry.slug)).toEqual(["own-one", "proof-one"]);
  });

  it("lists only own pages for the sitemap", () => {
    expect(ownPageSlugs("en", options)).toEqual(["own-one"]);
  });

  it("finds the templates paired with a for or features page, blocks included", () => {
    expect(templatesPairedWith("en", "/for/real-estate", options).map((item) => item.entry.slug)).toEqual([
      "proof-one",
      "block-one",
    ]);
    expect(templatesPairedWith("en", "/for/recruiting", options)).toEqual([]);
  });

  it("resolves one slug with its visibility", () => {
    expect(templateVisibilityBySlug("proof-one", "en", options)?.visibility).toBe("proof");
    expect(templateVisibilityBySlug("draft-one", "en", options)).toBeNull();
    expect(templateVisibilityBySlug("missing", "en", options)).toBeNull();
  });

  it("names the locales in which a page is indexable", () => {
    const both = indexOf(
      entryOf("a", {
        locales: { de: localeOf({ publicPage: "own" }), en: localeOf({ publicPage: "proof" }), fr: localeOf() },
      }),
    );
    expect(indexableLocales("a", ["en", "de", "fr", "it"], { index: both, shipped: ALL_CAPABILITIES })).toEqual([
      "de",
      "fr",
    ]);
  });
});

describe("hub visibility", () => {
  it("is hidden when nothing is public", () => {
    const index = indexOf(entryOf("a", { locales: { en: localeOf({ status: "draft" }) } }));

    expect(hubVisibility("en", { index })).toBe("hidden");
  });

  it("is noindex when only proof pages exist", () => {
    expect(
      hubVisibility("en", { index: indexOf(entryOf("a", { locales: { en: localeOf({ publicPage: "proof" }) } })) }),
    ).toBe("noindex");
  });

  it("is indexable as soon as one own page exists", () => {
    expect(hubVisibility("en", { index: indexOf(entryOf("a")) })).toBe("indexable");
  });

  it("is decided per locale", () => {
    const index = indexOf(entryOf("a", { locales: { en: localeOf() } }));
    expect(hubVisibility("de", { index })).toBe("hidden");
  });
});
