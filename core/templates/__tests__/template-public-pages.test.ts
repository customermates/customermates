import { describe, expect, it } from "vitest";

import { MARKETING_LOCALES } from "@/i18n/locale-registry";
import { getTemplateIndex } from "@/core/templates/template-index";
import { hubVisibility, pageTemplates, templateVisibility } from "@/core/templates/template-publication";

import { ALL_CAPABILITIES } from "./template-publication-fixtures";

const INDEX = getTemplateIndex();
const DASH = /[–—]/u;

describe("the shipped template index", () => {
  it("never makes a locale public that is not published, even with every capability shipped", () => {
    const leaks = INDEX.flatMap((entry) =>
      Object.entries(entry.locales)
        .filter(
          ([locale, text]) =>
            text.status !== "published" &&
            templateVisibility(entry, locale, { shipped: ALL_CAPABILITIES }) !== "hidden",
        )
        .map(([locale]) => `${entry.slug}/${locale}`),
    );

    expect(leaks).toEqual([]);
  });

  it("shows no template page, hub or navigation link in any locale until a status is published", () => {
    const published = INDEX.some((entry) => Object.values(entry.locales).some((text) => text.status === "published"));
    if (published) return;

    for (const locale of MARKETING_LOCALES) {
      expect(pageTemplates(locale, { shipped: ALL_CAPABILITIES }), locale).toEqual([]);
      expect(hubVisibility(locale, { shipped: ALL_CAPABILITIES }), locale).toBe("hidden");
    }
  });

  it("carries the page text in every published locale that has an own or proof page", () => {
    const missing = INDEX.flatMap((entry) =>
      Object.entries(entry.locales)
        .filter(([, text]) => text.status === "published" && text.publicPage !== "none" && !text.page)
        .map(([locale]) => `${entry.slug}/${locale}`),
    );

    expect(missing, "a published locale page needs the page block in its locale file").toEqual([]);
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
