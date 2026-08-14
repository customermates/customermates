import { CONTENT_LOCALES, isContentLocale, type ContentLocale } from "@/i18n/locale-registry";

import {
  CLOUD_TRIAL,
  formatCommercialAmount,
  getCommercialOfferOrThrow,
  getPlanDefinition,
  isPlanId,
  totalPriceAmountMinor,
} from "./plan-catalog";

const TOKEN_PATTERN = /\[\[commercial\.([^\]]+)\]\]/g;
const CONTENT_LOCALE_PATTERN = new RegExp(`(?:^|[/\\\\])(${CONTENT_LOCALES.join("|")})(?:[/\\\\])`);

export function contentLocaleFromPath(filePath: string): ContentLocale {
  const locale = filePath.match(CONTENT_LOCALE_PATTERN)?.[1];
  if (isContentLocale(locale)) return locale;
  throw new Error(`Cannot resolve commercial-token locale from ${filePath}`);
}

function localizedUnlimited(locale: string): string {
  return locale.startsWith("de") ? "unbegrenzt" : "unlimited";
}

function resolvePriceToken(parts: string[], locale: string): string {
  const [, rawPlan, rawCadence, modifier, rawSeats, periodModifier, rawPeriods] = parts;
  if (!rawPlan || !isPlanId(rawPlan) || (rawCadence !== "monthly" && rawCadence !== "annual"))
    throw new Error(`Invalid commercial price token: ${parts.join(".")}`);

  const offer = getCommercialOfferOrThrow(rawPlan, rawCadence);
  if (modifier === undefined) {
    if (parts.length !== 3) throw new Error(`Invalid commercial price token: ${parts.join(".")}`);
    return formatCommercialAmount(offer.unitPriceMinor, locale, offer.currency);
  }
  if (modifier !== "seats" || !rawSeats || !/^\d+$/.test(rawSeats))
    throw new Error(`Invalid commercial price token: ${parts.join(".")}`);

  let amountMinor = totalPriceAmountMinor(offer, Number(rawSeats));
  if (periodModifier === undefined) {
    if (parts.length !== 5) throw new Error(`Invalid commercial price token: ${parts.join(".")}`);
  } else {
    if (
      parts.length !== 7 ||
      periodModifier !== "months" ||
      !rawPeriods ||
      !/^\d+$/.test(rawPeriods) ||
      !Number.isSafeInteger(Number(rawPeriods)) ||
      Number(rawPeriods) < 1
    )
      throw new Error(`Invalid commercial price token: ${parts.join(".")}`);
    amountMinor *= Number(rawPeriods);
    if (!Number.isSafeInteger(amountMinor))
      throw new Error(`Commercial price token total exceeds the safe integer range: ${parts.join(".")}`);
  }

  return formatCommercialAmount(amountMinor, locale, offer.currency);
}

function resolveEntitlementToken(parts: string[], locale: string): string {
  const [, rawPlan, entitlement] = parts;
  if (parts.length !== 3 || !rawPlan || !isPlanId(rawPlan) || entitlement !== "includedAccountsPerUser")
    throw new Error(`Invalid commercial entitlement token: ${parts.join(".")}`);

  const value = getPlanDefinition(rawPlan).entitlements.includedAccountsPerUser;
  return value === "unlimited" ? localizedUnlimited(locale) : String(value);
}

export function resolveCommercialToken(token: string, locale: string): string {
  const parts = token.split(".");
  if (parts[0] === "price") return resolvePriceToken(parts, locale);
  if (token === "trial.days") return String(CLOUD_TRIAL.days);
  if (parts[0] === "entitlement") return resolveEntitlementToken(parts, locale);
  throw new Error(`Unknown commercial token: ${token}`);
}

export function resolveCommercialTokens(value: string, locale: string): string {
  const resolved = value.replace(TOKEN_PATTERN, (_match, token: string) => resolveCommercialToken(token, locale));
  if (resolved.includes("[[commercial.")) throw new Error("Malformed or unresolved commercial token");
  return resolved;
}

export function resolveCommercialTokensDeep<T>(value: T, locale: string): T {
  if (typeof value === "string") return resolveCommercialTokens(value, locale) as T;
  if (Array.isArray(value)) return value.map((item) => resolveCommercialTokensDeep(item, locale)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveCommercialTokensDeep(item, locale)]),
    ) as T;
  }
  return value;
}

export function unresolvedCommercialTokens(value: string): string[] {
  return [...value.matchAll(TOKEN_PATTERN)].map((match) => match[0]);
}
