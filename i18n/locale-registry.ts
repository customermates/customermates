type LocaleCapabilities = {
  offeredAsDisplayLanguage: boolean;
  offeredAsFormattingLocale: boolean;
  hasPublishedContent: boolean;
  formattingTag: string;
  flagCode: string;
  validationTag: string;
  lowercaseEntityLabelsInSentences: boolean;
};

export const LOCALE_REGISTRY = {
  en: {
    offeredAsDisplayLanguage: true,
    offeredAsFormattingLocale: true,
    hasPublishedContent: true,
    formattingTag: "en-US",
    flagCode: "us",
    validationTag: "en",
    lowercaseEntityLabelsInSentences: true,
  },
  de: {
    offeredAsDisplayLanguage: true,
    offeredAsFormattingLocale: true,
    hasPublishedContent: true,
    formattingTag: "de-DE",
    flagCode: "de",
    validationTag: "de",
    lowercaseEntityLabelsInSentences: false,
  },
  fr: {
    offeredAsDisplayLanguage: true,
    offeredAsFormattingLocale: true,
    hasPublishedContent: false,
    formattingTag: "fr-FR",
    flagCode: "fr",
    validationTag: "fr",
    lowercaseEntityLabelsInSentences: true,
  },
  it: {
    offeredAsDisplayLanguage: true,
    offeredAsFormattingLocale: true,
    hasPublishedContent: false,
    formattingTag: "it-IT",
    flagCode: "it",
    validationTag: "it",
    lowercaseEntityLabelsInSentences: true,
  },
  es: {
    offeredAsDisplayLanguage: true,
    offeredAsFormattingLocale: true,
    hasPublishedContent: false,
    formattingTag: "es-ES",
    flagCode: "es",
    validationTag: "es",
    lowercaseEntityLabelsInSentences: true,
  },
} as const satisfies Record<string, LocaleCapabilities>;

export type LocaleCode = keyof typeof LOCALE_REGISTRY;

export type AppLocale = {
  [Code in LocaleCode]: (typeof LOCALE_REGISTRY)[Code]["offeredAsDisplayLanguage"] extends true ? Code : never;
}[LocaleCode];

export type ContentLocale = {
  [Code in LocaleCode]: (typeof LOCALE_REGISTRY)[Code]["hasPublishedContent"] extends true ? Code : never;
}[LocaleCode];

export type FormattingLocale = {
  [Code in LocaleCode]: (typeof LOCALE_REGISTRY)[Code]["offeredAsFormattingLocale"] extends true ? Code : never;
}[LocaleCode];

export type RoutingLocale = AppLocale | ContentLocale;

export const DEFAULT_LOCALE: AppLocale & ContentLocale & FormattingLocale = "en";

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LOCALE_REGISTRY, value);
}

export function isAppLocale(value: unknown): value is AppLocale {
  return isLocaleCode(value) && LOCALE_REGISTRY[value].offeredAsDisplayLanguage;
}

export function isContentLocale(value: unknown): value is ContentLocale {
  return isLocaleCode(value) && LOCALE_REGISTRY[value].hasPublishedContent;
}

export function isFormattingLocale(value: unknown): value is FormattingLocale {
  return isLocaleCode(value) && LOCALE_REGISTRY[value].offeredAsFormattingLocale;
}

export function isRoutingLocale(value: unknown): value is RoutingLocale {
  return isAppLocale(value) || isContentLocale(value);
}

export const REGISTERED_LOCALES: readonly LocaleCode[] = Object.keys(LOCALE_REGISTRY) as LocaleCode[];

export const APP_LOCALES: readonly AppLocale[] = REGISTERED_LOCALES.filter(isAppLocale);

export const CONTENT_LOCALES: readonly ContentLocale[] = REGISTERED_LOCALES.filter(isContentLocale);

export const FORMATTING_LOCALES: readonly FormattingLocale[] = REGISTERED_LOCALES.filter(isFormattingLocale);

export const ROUTING_LOCALES: readonly RoutingLocale[] = REGISTERED_LOCALES.filter(isRoutingLocale);

export function appLocaleOrDefault(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

export function contentLocaleOrDefault(value: unknown): ContentLocale {
  return isContentLocale(value) ? value : DEFAULT_LOCALE;
}

export function formattingTagFor(locale: LocaleCode): string {
  return LOCALE_REGISTRY[locale].formattingTag;
}

export function validationTagFor(locale: AppLocale): string {
  return LOCALE_REGISTRY[locale].validationTag;
}

export function lowercaseEntityLabelsInSentences(locale: AppLocale): boolean {
  return LOCALE_REGISTRY[locale].lowercaseEntityLabelsInSentences;
}

export function flagCodeFor(locale: LocaleCode): string {
  return LOCALE_REGISTRY[locale].flagCode;
}

function localeFromLanguageTag<Locale extends LocaleCode>(value: string, locales: readonly Locale[]): Locale | null {
  let canonical: string;

  try {
    canonical = Intl.getCanonicalLocales(value)[0] ?? "";
  } catch {
    return null;
  }

  const exact = locales.find((locale) => locale.toLowerCase() === canonical.toLowerCase());
  if (exact) return exact;

  const base = canonical.split("-")[0]?.toLowerCase();
  return locales.find((locale) => locale.toLowerCase() === base) ?? null;
}

export function appLocaleFromLanguageTag(value: string): AppLocale | null {
  return localeFromLanguageTag(value, APP_LOCALES);
}

export function routingLocaleFromUrlSegment(value: string): RoutingLocale | null {
  return ROUTING_LOCALES.find((locale) => locale.toLowerCase() === value.toLowerCase()) ?? null;
}

export function routingLocaleFromPathname(pathname: string): RoutingLocale | null {
  const firstSegment = pathname.split("/")[1];
  return firstSegment ? routingLocaleFromUrlSegment(firstSegment) : null;
}

export function stripLocalePrefix(pathname: string): string {
  const locale = routingLocaleFromPathname(pathname);
  if (locale === null) return pathname;
  const remainder = pathname.slice(locale.length + 1);
  return remainder === "" ? "/" : remainder;
}

export function buildLocalePath(locale: string, routePath: string): string {
  return routePath === "/" ? `/${locale}` : `/${locale}${routePath}`;
}
