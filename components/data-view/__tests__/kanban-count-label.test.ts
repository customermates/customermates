import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import fr from "@/i18n/locales/fr.json";

describe("board column count label", () => {
  it.each([
    ["en", en, 1, "1 deal"],
    ["en", en, 2, "2 deals"],
    ["en", en, 0, "0 deals"],
    ["de", de, 1, "1 deal"],
    ["fr", fr, 0, "0 deal"],
    ["fr", fr, 2, "2 deals"],
  ] as const)("pluralizes %s for %i records with the locale's plural rules", (locale, messages, count, expected) => {
    const t = createTranslator({ locale, messages, namespace: "DataView" });
    expect(t("kanbanCount", { count, singular: "deal", plural: "deals" })).toBe(expected);
  });
});
