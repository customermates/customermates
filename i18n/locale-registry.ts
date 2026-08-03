type LocaleCapabilities = {
  offeredAsDisplayLanguage: boolean;
  hasPublishedContent: boolean;
  formattingTag: string;
  flagCode: string;
};

export const LOCALE_REGISTRY = {
  en: { offeredAsDisplayLanguage: true, hasPublishedContent: true, formattingTag: "en-US", flagCode: "us" },
  de: { offeredAsDisplayLanguage: true, hasPublishedContent: true, formattingTag: "de-DE", flagCode: "de" },
  fr: { offeredAsDisplayLanguage: true, hasPublishedContent: false, formattingTag: "fr-FR", flagCode: "fr" },
} as const satisfies Record<string, LocaleCapabilities>;

export type RoutingLocale = keyof typeof LOCALE_REGISTRY;

export type AppLocale = {
  [Code in RoutingLocale]: (typeof LOCALE_REGISTRY)[Code]["offeredAsDisplayLanguage"] extends true ? Code : never;
}[RoutingLocale];

export type ContentLocale = {
  [Code in RoutingLocale]: (typeof LOCALE_REGISTRY)[Code]["hasPublishedContent"] extends true ? Code : never;
}[RoutingLocale];

export const DEFAULT_LOCALE: AppLocale & ContentLocale = "en";

export function isRoutingLocale(value: unknown): value is RoutingLocale {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LOCALE_REGISTRY, value);
}

export function isAppLocale(value: unknown): value is AppLocale {
  return isRoutingLocale(value) && LOCALE_REGISTRY[value].offeredAsDisplayLanguage;
}

export function isContentLocale(value: unknown): value is ContentLocale {
  return isRoutingLocale(value) && LOCALE_REGISTRY[value].hasPublishedContent;
}

export const ROUTING_LOCALES: readonly RoutingLocale[] = Object.keys(LOCALE_REGISTRY) as RoutingLocale[];

export const APP_LOCALES: readonly AppLocale[] = ROUTING_LOCALES.filter(isAppLocale);

export const CONTENT_LOCALES: readonly ContentLocale[] = ROUTING_LOCALES.filter(isContentLocale);

export function appLocaleOrDefault(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

export function contentLocaleOrDefault(value: unknown): ContentLocale {
  return isContentLocale(value) ? value : DEFAULT_LOCALE;
}

export function formattingTagFor(locale: RoutingLocale): string {
  return LOCALE_REGISTRY[locale].formattingTag;
}

export function flagCodeFor(locale: RoutingLocale): string {
  return LOCALE_REGISTRY[locale].flagCode;
}

export function routingLocaleFromPathname(pathname: string): RoutingLocale | null {
  const firstSegment = pathname.split("/")[1];
  return isRoutingLocale(firstSegment) ? firstSegment : null;
}

export function stripLocalePrefix(pathname: string): string {
  const locale = routingLocaleFromPathname(pathname);
  if (locale === null) return pathname;
  const remainder = pathname.slice(locale.length + 1);
  return remainder === "" ? "/" : remainder;
}
