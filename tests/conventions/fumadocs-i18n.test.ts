import { describe, expect, it } from "vitest";

import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";
import { i18n } from "@/core/fumadocs/i18n";

const ENFORCED = true;

describe("fumadocs locale configuration", () => {
  it.skipIf(!ENFORCED)("resolves content against the content locales only", () => {
    expect([...i18n.languages].sort()).toEqual([...CONTENT_LOCALES].sort());
    expect(i18n.defaultLanguage).toBe(DEFAULT_LOCALE);
  });

  it.skipIf(!ENFORCED)("never falls back to another language", () => {
    expect(
      i18n.fallbackLanguage,
      "a fallback language serves default-locale prose under a localized URL and keeps untranslated pages in the sitemap",
    ).toBeNull();
  });

  it.skipIf(!ENFORCED)("does not resolve pages for a locale without published content", () => {
    expect(i18n.languages).not.toContain("zz");
  });
});
