import { describe, expect, it } from "vitest";

import { FORMATTING_LOCALES, formattingTagFor } from "@/i18n/locale-registry";

import { formatLocalizedNumber, parseLocalizedNumber } from "../intl-number";

describe("localized number parsing", () => {
  it.each(FORMATTING_LOCALES)("round-trips grouped decimals for %s", (locale) => {
    const tag = formattingTagFor(locale);
    const formatted = formatLocalizedNumber(1234567.89, tag, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      useGrouping: true,
    });

    expect(parseLocalizedNumber(formatted, tag)).toBe(1234567.89);
  });

  it("distinguishes decimal and grouping separators by locale", () => {
    expect(parseLocalizedNumber("1,234.5", "en-US")).toBe(1234.5);
    expect(parseLocalizedNumber("1.234,5", "de-DE")).toBe(1234.5);
    expect(parseLocalizedNumber("1\u202f234,5", "fr-FR")).toBe(1234.5);
    expect(parseLocalizedNumber("1 234,5", "fr-FR")).toBe(1234.5);
    expect(parseLocalizedNumber("1.234", "en-US")).toBe(1.234);
    expect(parseLocalizedNumber("1.234", "de-DE")).toBe(1234);
    expect(parseLocalizedNumber("1,234", "en-US")).toBe(1234);
    expect(parseLocalizedNumber("1,234", "de-DE")).toBe(1.234);
  });

  it("round-trips regional grouping patterns used by System formatting", () => {
    const formatted = formatLocalizedNumber(1234567.89, "en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      useGrouping: true,
    });

    expect(formatted).toBe("12,34,567.89");
    expect(parseLocalizedNumber(formatted, "en-IN")).toBe(1234567.89);
    expect(parseLocalizedNumber("1,234,567.89", "en-IN")).toBeUndefined();
  });

  it("round-trips localized digits and bidirectional sign marks in System formatting", () => {
    const formatted = formatLocalizedNumber(-1234.5, "ar-EG", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
      useGrouping: true,
    });

    expect(parseLocalizedNumber(formatted, "ar-EG")).toBe(-1234.5);
    expect(parseLocalizedNumber(".5", "en-US")).toBe(0.5);
  });

  it("rejects malformed, partial, and suffixed values instead of truncating them", () => {
    for (const value of ["1,23,4", "1.2.3", "12abc", "12 €", "+", "-", "", "  "])
      expect(parseLocalizedNumber(value, "en-US"), value).toBeUndefined();
  });
});
