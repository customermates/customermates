import { describe, expect, it } from "vitest";

import { MARKETING_LOCALES } from "@/i18n/locale-registry";
import { getTemplateIndex } from "@/core/templates/template-index";
import { hubVisibility, pageTemplates, templateVisibility } from "@/core/templates/template-publication";

const INDEX = getTemplateIndex();
const DASH = /[–—]/u;

describe("the shipped template index", () => {
  it("makes a locale public exactly as far as its publication says", () => {
    const wrong = INDEX.flatMap((entry) =>
      Object.entries(entry.locales)
        .filter(([locale, text]) => templateVisibility(entry, locale, { deployment: "cloud" }) !== text.publication)
        .map(([locale]) => `${entry.slug}/${locale}`),
    );

    expect(wrong).toEqual([]);
  });

  it("lists a page only for the locales whose publication is indexed or noindex", () => {
    for (const locale of MARKETING_LOCALES) {
      const expected = INDEX.filter((entry) =>
        ["indexed", "noindex"].includes(entry.locales[locale]?.publication ?? ""),
      );
      expect(
        pageTemplates(locale, { deployment: "cloud" }).map((item) => item.entry.slug),
        locale,
      ).toEqual(expected.map((entry) => entry.slug));
    }
  });

  it("indexes the hub only in locales that have an indexed page", () => {
    for (const locale of MARKETING_LOCALES) {
      const publications = INDEX.map((entry) => entry.locales[locale]?.publication);
      const expected = publications.includes("indexed")
        ? "indexable"
        : publications.includes("noindex")
          ? "noindex"
          : "hidden";
      expect(hubVisibility(locale, { deployment: "cloud" }), locale).toBe(expected);
    }
  });

  it("carries the page text in every locale that has an indexed or noindex page", () => {
    const missing = INDEX.flatMap((entry) =>
      Object.entries(entry.locales)
        .filter(([, text]) => text.publication !== "none" && !text.page)
        .map(([locale]) => `${entry.slug}/${locale}`),
    );

    expect(missing, "a locale page needs the page block in its locale file").toEqual([]);
  });

  it("keeps the page meta text within the search result limits", () => {
    const outside = INDEX.flatMap((entry) =>
      Object.entries(entry.locales).flatMap(([locale, text]) => {
        if (!text.page) return [];
        const { metaDescription, metaTitle } = text.page;
        const problems: string[] = [];
        if (metaTitle.length < 30 || metaTitle.length > 60) problems.push("title");
        if (metaDescription.length < 70 || metaDescription.length > 158) problems.push("description");
        return problems.map((problem) => `${entry.slug}/${locale} ${problem}`);
      }),
    );

    expect(outside).toEqual([]);
  });

  it("uses no dash characters in the page meta text", () => {
    const dashes = INDEX.flatMap((entry) =>
      Object.entries(entry.locales)
        .filter(([, text]) => text.page && DASH.test(`${text.page.metaTitle}${text.page.metaDescription}`))
        .map(([locale]) => `${entry.slug}/${locale}`),
    );

    expect(dashes).toEqual([]);
  });
});
