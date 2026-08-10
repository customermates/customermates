import { describe, expect, it } from "vitest";

import { terminologyLabelForSentence } from "../entity-terminology-label.utils";

import type { AppLocale } from "@/i18n/locale-registry";

import { APP_LOCALES } from "@/i18n/locale-registry";

const EXPECTED = {
  de: "Leistungen",
  en: "leistungen",
  es: "leistungen",
  fr: "leistungen",
  it: "leistungen",
} satisfies Record<AppLocale, string>;

describe("terminologyLabelForSentence", () => {
  it("uses lower-case renamed nouns in English sentence copy", () => {
    expect(terminologyLabelForSentence("Packages", "en")).toBe("packages");
  });

  it("preserves German noun capitalization", () => {
    expect(terminologyLabelForSentence("Leistungen", "de")).toBe("Leistungen");
  });

  it("defines sentence casing for every application locale", () => {
    for (const locale of APP_LOCALES)
      expect(terminologyLabelForSentence("Leistungen", locale), locale).toBe(EXPECTED[locale]);
  });
});
