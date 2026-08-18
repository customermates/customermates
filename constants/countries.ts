import { CountryCode } from "@/generated/prisma";

import type { AppLocale } from "@/i18n/locale-registry";

import { formattingTagFor } from "@/i18n/locale-registry";

export type CountryOption = { key: CountryCode; label: string };

export const COUNTRY_CODES: readonly CountryCode[] = Object.values(CountryCode);

export function countryLabelForLocale(countryCode: string, locale: AppLocale): string {
  const displayNames = new Intl.DisplayNames([formattingTagFor(locale)], { type: "region" });
  return displayNames.of(countryCode.toUpperCase()) ?? countryCode.toUpperCase();
}

export function countryOptionsForLocale(locale: AppLocale): CountryOption[] {
  const localeTag = formattingTagFor(locale);
  const displayNames = new Intl.DisplayNames([localeTag], { type: "region" });
  const collator = new Intl.Collator(localeTag);

  return COUNTRY_CODES.map((countryCode) => ({
    key: countryCode,
    label: displayNames.of(countryCode.toUpperCase()) ?? countryCode.toUpperCase(),
  })).sort((left, right) => collator.compare(left.label, right.label));
}
