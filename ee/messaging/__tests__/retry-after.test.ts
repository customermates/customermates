import { describe, expect, it } from "vitest";

import { APP_LOCALES, DEFAULT_LOCALE, formattingTagFor } from "@/i18n/locale-registry";

import { formatRetryAfter, RETRY_AFTER_LATER } from "../retry-after";

describe("formatRetryAfter", () => {
  it.each(APP_LOCALES)("uses the registered display-language tag for %s", (locale) => {
    const formatter = new Intl.RelativeTimeFormat(formattingTagFor(locale), { numeric: "always" });

    expect(formatRetryAfter(locale, 45)).toBe(formatter.format(45, "second"));
    expect(formatRetryAfter(locale, 90)).toBe(formatter.format(2, "minute"));
    expect(formatRetryAfter(locale, 7200)).toBe(formatter.format(2, "hour"));
  });

  it("falls back safely for an unsupported tag", () => {
    const expected = new Intl.RelativeTimeFormat(formattingTagFor(DEFAULT_LOCALE), { numeric: "always" }).format(
      2,
      "minute",
    );

    expect(formatRetryAfter("not-a-locale", 90)).toBe(expected);
  });

  it.each(APP_LOCALES)("says later instead of inventing a wait when the provider gives none (%s)", (locale) => {
    expect(formatRetryAfter(locale, null)).toBe(RETRY_AFTER_LATER);
  });
});
