import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import frMessages from "@/i18n/locales/fr.json";
import {
  MARKETING_LOCALES,
  isMarketingLocale,
  marketingLocaleOrDefault,
  type MarketingLocale,
} from "@/i18n/locale-registry";

import {
  CLOUD_TRIAL,
  CLOUD_WORKSPACE_CREATION_LIMIT,
  formatCommercialAmount,
  getCommercialOfferOrThrow,
  getPlanDefinition,
  GIB,
  isPlanId,
  totalPriceAmountMinor,
} from "./plan-catalog";

const TOKEN_PATTERN = /\[\[commercial\.([^\]]+)\]\]/g;
const MARKETING_LOCALE_PATTERN = new RegExp(`(?:^|[/\\\\])(${MARKETING_LOCALES.join("|")})(?:[/\\\\])`);

const UNLIMITED_LABEL = { translationKey: "Common.unlimited" } as const;

const CONTRACT_LABEL = { translationKey: "Common.unlimitedByContract" } as const;

const MARKETING_MESSAGES: Record<MarketingLocale, unknown> = { de: deMessages, en: enMessages, fr: frMessages };

function catalogText(messages: unknown, key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, segment) => (node && typeof node === "object" ? (node as Record<string, unknown>)[segment] : undefined),
      messages,
    );
  if (typeof value !== "string") throw new Error(`Missing message ${key}`);
  return value;
}

export function contentLocaleFromPath(filePath: string): MarketingLocale {
  const locale = filePath.match(MARKETING_LOCALE_PATTERN)?.[1];
  if (isMarketingLocale(locale)) return locale;
  throw new Error(`Cannot resolve commercial-token locale from ${filePath}`);
}

function localizedUnlimited(locale: string): string {
  return catalogText(
    MARKETING_MESSAGES[marketingLocaleOrDefault(locale.split("-")[0])],
    UNLIMITED_LABEL.translationKey,
  );
}

function localizedContract(locale: string): string {
  return catalogText(MARKETING_MESSAGES[marketingLocaleOrDefault(locale.split("-")[0])], CONTRACT_LABEL.translationKey);
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

const COUNTED_ENTITLEMENTS = ["includedAccountsPerUser", "includedRoutinesPerUser"] as const;

type CountedEntitlement = (typeof COUNTED_ENTITLEMENTS)[number];

function isCountedEntitlement(value: string): value is CountedEntitlement {
  return (COUNTED_ENTITLEMENTS as readonly string[]).includes(value);
}

function resolveEntitlementToken(parts: string[], locale: string): string {
  const [, rawPlan, entitlement] = parts;
  if (parts.length !== 3 || !rawPlan || !isPlanId(rawPlan) || !entitlement || !isCountedEntitlement(entitlement))
    throw new Error(`Invalid commercial entitlement token: ${parts.join(".")}`);

  const value = getPlanDefinition(rawPlan).entitlements[entitlement];
  return value === "unlimited" ? localizedUnlimited(locale) : String(value);
}

function resolveStorageToken(parts: string[], locale: string): string {
  const [, rawPlan] = parts;
  if (parts.length !== 2 || !rawPlan || !isPlanId(rawPlan))
    throw new Error(`Invalid commercial storage token: ${parts.join(".")}`);
  const bytes = getPlanDefinition(rawPlan).entitlements.fileStorageBytesPerActiveUser;
  if (bytes === "contract") return localizedContract(locale);
  if (bytes === null) return localizedUnlimited(locale);
  return `${new Intl.NumberFormat(locale).format(bytes / GIB)} GB`;
}

function resolveCommercialToken(token: string, locale: string): string {
  const parts = token.split(".");
  if (parts[0] === "storage") return resolveStorageToken(parts, locale);
  if (parts[0] === "price") return resolvePriceToken(parts, locale);
  if (token === "trial.days") return String(CLOUD_TRIAL.days);
  if (token === "workspaces.creationLimit") return String(CLOUD_WORKSPACE_CREATION_LIMIT);
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
