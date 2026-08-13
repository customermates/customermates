import type { ContentLocale } from "@/i18n/locale-registry";

import { DEFAULT_LOCALE, buildLocalePath } from "@/i18n/locale-registry";

const RECIPROCAL_ALTERNATE_MINIMUM = 2;

export function buildAlternateLanguages(
  routePath: string,
  availableLocales: readonly ContentLocale[],
  baseUrl: string,
): Record<string, string> | undefined {
  const distinctLocales = [...new Set(availableLocales)];

  if (distinctLocales.length < RECIPROCAL_ALTERNATE_MINIMUM) return undefined;

  const languages: Record<string, string> = {};

  for (const locale of distinctLocales) languages[locale] = `${baseUrl}${buildLocalePath(locale, routePath)}`;

  if (distinctLocales.includes(DEFAULT_LOCALE))
    languages["x-default"] = `${baseUrl}${buildLocalePath(DEFAULT_LOCALE, routePath)}`;

  return languages;
}
