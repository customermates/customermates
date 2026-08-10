import type { AppLocale } from "./locale-registry";

import {
  DEFAULT_LOCALE,
  appLocaleFromLanguageTag,
  appLocaleOrDefault,
  isAppLocale,
  stripLocalePrefix,
} from "./locale-registry";

export const APP_LOCALE_COOKIE_NAME = "APP_LOCALE";
export const CONTENT_LOCALE_COOKIE_NAME = "CONTENT_LOCALE";

export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export function browserAppLocale(languages: readonly string[]): AppLocale {
  for (const language of languages) {
    const locale = appLocaleFromLanguageTag(language);
    if (locale) return locale;
  }

  return DEFAULT_LOCALE;
}

export function displayLanguageNavigationTarget(locale: unknown, pathname: string): string {
  const suffixStart = pathname.search(/[?#]/);
  const path = suffixStart === -1 ? pathname : pathname.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? "" : pathname.slice(suffixStart);
  const unprefixedPath = stripLocalePrefix(path);
  if (locale === "system") return `${unprefixedPath}${suffix}`;

  const localizedPath =
    unprefixedPath === "/" ? `/${appLocaleOrDefault(locale)}` : `/${appLocaleOrDefault(locale)}${unprefixedPath}`;
  return `${localizedPath}${suffix}`;
}

export function appLocaleReconciliationTarget(
  displayLanguage: unknown,
  currentLocale: string,
  pathname: string,
  systemLocale: AppLocale,
): string | null {
  const desiredLocale = displayLanguage === "system" ? systemLocale : displayLanguage;
  if (!isAppLocale(desiredLocale) || currentLocale === desiredLocale) return null;
  return displayLanguageNavigationTarget(desiredLocale, pathname);
}

export function expiredAppLocaleCookie(): string {
  return `${APP_LOCALE_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function appLocaleCookie(locale: AppLocale): string {
  return `${APP_LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function appLocaleCookieUpdate(displayLanguage: unknown, cookieHeader: string): string | null {
  if (displayLanguage === null || displayLanguage === undefined) return null;

  const currentValue = cookieHeader
    .split(";")
    .map((entry) => entry.trim().split("="))
    .find(([name]) => name === APP_LOCALE_COOKIE_NAME)?.[1];

  if (!isAppLocale(displayLanguage)) return currentValue === undefined ? null : expiredAppLocaleCookie();
  return currentValue === displayLanguage ? null : appLocaleCookie(displayLanguage);
}
