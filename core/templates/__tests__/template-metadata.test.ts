import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: (): never => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

import { generateTemplatePageMetadata, generateTemplatesHubMetadata } from "@/core/templates/template-metadata";

import { ALL_CAPABILITIES, entryOf, indexOf, localeOf } from "./template-publication-fixtures";

const BASE = "http://localhost:4000";

const index = indexOf(
  entryOf("tracker", {
    locales: {
      de: localeOf({ publicPage: "own" }),
      en: localeOf({ publicPage: "own" }),
      fr: localeOf({ publicPage: "proof" }),
      it: localeOf({ status: "draft" }),
    },
  }),
);
const options = { index, shipped: ALL_CAPABILITIES };
const copy = {
  description: "Hub description that reads as a real search snippet for the templates hub page.",
  title: "Hub title",
};

describe("template page metadata", () => {
  it("canonicalises an own page and lists only the own locales in hreflang", () => {
    const metadata = generateTemplatePageMetadata("en", "tracker", options);

    expect(metadata.alternates).toEqual({
      canonical: `${BASE}/en/templates/tracker`,
      languages: {
        de: `${BASE}/de/templates/tracker`,
        en: `${BASE}/en/templates/tracker`,
        "x-default": `${BASE}/en/templates/tracker`,
      },
    });
    expect(metadata.robots).toBeUndefined();
    expect(metadata.description).toBe(
      "A description that is long enough to read as a real search snippet for the fixture page.",
    );
  });

  it("marks a proof page noindex with follow and no hreflang", () => {
    const metadata = generateTemplatePageMetadata("fr", "tracker", options);

    expect(metadata.robots).toEqual({ follow: true, index: false });
    expect(metadata.alternates).toEqual({ canonical: `${BASE}/fr/templates/tracker` });
  });

  it.each([
    ["a draft locale", "it", "tracker"],
    ["a locale without text", "pl", "tracker"],
    ["an unknown slug", "en", "missing"],
  ])("answers %s with a 404", (_label, locale, slug) => {
    expect(() => generateTemplatePageMetadata(locale, slug, options)).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});

describe("templates hub metadata", () => {
  it("is indexable with hreflang across the locales that have an own page", () => {
    const metadata = generateTemplatesHubMetadata("en", copy, options);

    expect(metadata.title).toBe("Hub title | Customermates");
    expect(metadata.alternates).toEqual({
      canonical: `${BASE}/en/templates`,
      languages: {
        de: `${BASE}/de/templates`,
        en: `${BASE}/en/templates`,
        "x-default": `${BASE}/en/templates`,
      },
    });
    expect(metadata.robots).toBeUndefined();
  });

  it("is noindex in a locale that only has proof pages", () => {
    expect(generateTemplatesHubMetadata("fr", copy, options).robots).toEqual({ follow: true, index: false });
  });

  it("answers a locale without public pages with a 404", () => {
    expect(() => generateTemplatesHubMetadata("it", copy, options)).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });
});
