import { describe, expect, it } from "vitest";

import { COUNTRY_CODES, countryOptionsForLocale } from "../countries";
import { APP_LOCALES, formattingTagFor, type AppLocale } from "@/i18n/locale-registry";

const REPRESENTATIVE_COUNTRIES = ["ci", "de", "fr", "us"] as const;
type RepresentativeCountry = (typeof REPRESENTATIVE_COUNTRIES)[number];

const REPRESENTATIVE_NAMES = {
  de: { de: "Deutschland", fr: "Frankreich", ci: "Côte d’Ivoire", us: "Vereinigte Staaten" },
  en: { de: "Germany", fr: "France", ci: "Côte d’Ivoire", us: "United States" },
  es: { de: "Alemania", fr: "Francia", ci: "Côte d’Ivoire", us: "Estados Unidos" },
  fr: { de: "Allemagne", fr: "France", ci: "Côte d’Ivoire", us: "États-Unis" },
  it: { de: "Germania", fr: "Francia", ci: "Costa d’Avorio", us: "Stati Uniti" },
} satisfies Record<AppLocale, Record<RepresentativeCountry, string>>;

describe("countryOptionsForLocale", () => {
  it.each(APP_LOCALES)("uses localized representative region names for %s", (locale) => {
    const options = new Map(countryOptionsForLocale(locale).map((country) => [country.key, country.label]));

    expect(Object.keys(REPRESENTATIVE_NAMES[locale]).sort()).toEqual([...REPRESENTATIVE_COUNTRIES].sort());

    for (const [country, expected] of Object.entries(REPRESENTATIVE_NAMES[locale]))
      expect(options.get(country as RepresentativeCountry)).toBe(expected);
  });

  it.each(APP_LOCALES)("returns every country exactly once and locale-sorted for %s", (locale) => {
    const options = countryOptionsForLocale(locale);
    const collator = new Intl.Collator(formattingTagFor(locale));

    expect(options).toHaveLength(COUNTRY_CODES.length);
    expect(new Set(options.map((option) => option.key)).size).toBe(COUNTRY_CODES.length);
    expect(options.map((option) => option.label)).toEqual(
      [...options.map((option) => option.label)].sort((left, right) => collator.compare(left, right)),
    );
  });
});
