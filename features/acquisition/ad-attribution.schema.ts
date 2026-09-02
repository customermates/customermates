import { z } from "zod";

import {
  AD_IDENTIFIER_KINDS,
  AD_PROVIDER_ORDER,
  AdIdentifierKindSchema,
  AdProviderSchema,
  adClickExpiresAt,
  adProviderForIdentifierKind,
} from "./ad-provider-registry";

export const PUBLIC_AD_ATTRIBUTION_COOKIE_NAME = "cm_ad_attribution";
export const PUBLIC_AD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
export const PUBLIC_AD_ATTRIBUTION_PENDING_PARAM = "cm_ads_pending";
export const PUBLIC_AD_ATTRIBUTION_PENDING_MAX_AGE_SECONDS = 60 * 60 * 24;
export const PUBLIC_AD_ATTRIBUTION_PENDING_FUTURE_SKEW_SECONDS = 60 * 5;

const identifierValueSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[^\p{Cc}\p{Cf}\p{Z}]+$/u);

export const AdClickSchema = z.object({
  provider: AdProviderSchema,
  kind: AdIdentifierKindSchema,
  value: identifierValueSchema,
  clickedAt: z.iso.datetime(),
});
export type AdClick = z.infer<typeof AdClickSchema>;

export const RetainedAdClickSchema = AdClickSchema.extend({
  capturedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type RetainedAdClick = z.infer<typeof RetainedAdClickSchema>;

export const PublicAdAttributionConsentSchema = z.object({
  advertising: z.boolean(),
  decidedAt: z.iso.datetime(),
  noticeVersion: z.string().min(1).max(32),
});
export type PublicAdAttributionConsent = z.infer<typeof PublicAdAttributionConsentSchema>;

export const PublicAdAttributionCookieSchema = z.object({
  version: z.literal(1),
  consent: PublicAdAttributionConsentSchema,
  clicks: z.array(RetainedAdClickSchema).max(AD_PROVIDER_ORDER.length),
  expiresAt: z.iso.datetime(),
});
export type PublicAdAttributionCookie = z.infer<typeof PublicAdAttributionCookieSchema>;

const PublicAdAttributionSearchInputSchema = z.object({ search: z.string().max(2048) });

export const PublicAdAttributionVisitInputSchema = PublicAdAttributionSearchInputSchema.extend({
  pendingAt: z.iso.datetime(),
});
export type PublicAdAttributionVisitInput = z.infer<typeof PublicAdAttributionVisitInputSchema>;

export const PublicAdAttributionDecisionInputSchema = z.object({
  choice: z.enum(["allow-attribution", "necessary-only"]),
  visit: PublicAdAttributionVisitInputSchema.nullable(),
});
export type PublicAdAttributionDecisionInput = z.input<typeof PublicAdAttributionDecisionInputSchema>;

export const RegistrationAdAttributionSchema = z
  .object({
    provider: AdProviderSchema,
    identifierKind: AdIdentifierKindSchema,
    identifierValue: identifierValueSchema,
    clickedAt: z.date(),
    capturedAt: z.date(),
    consentedAt: z.date(),
    consentNoticeVersion: z.string().min(1).max(32),
    expiresAt: z.date(),
  })
  .refine((value) => value.clickedAt <= value.capturedAt, {
    message: "Ad click capture cannot predate the click",
    path: ["capturedAt"],
  })
  .refine((value) => value.expiresAt > value.clickedAt, {
    message: "Ad click expiry must follow the click",
    path: ["expiresAt"],
  });
export type RegistrationAdAttribution = z.infer<typeof RegistrationAdAttributionSchema>;

function searchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

export function normalizeAdClick(input: unknown, clickedAt = new Date()): AdClick | null {
  const parsed = PublicAdAttributionSearchInputSchema.safeParse(input);
  if (!parsed.success) return null;

  const params = searchParams(parsed.data.search);
  const candidates = AD_IDENTIFIER_KINDS.flatMap((kind) => params.getAll(kind).map((value) => ({ kind, value })));
  if (candidates.length !== 1) return null;

  const candidate = candidates[0];
  if (!candidate) return null;

  const provider = adProviderForIdentifierKind(candidate.kind);
  if (!provider) return null;

  const value = identifierValueSchema.safeParse(candidate.value);
  if (!value.success) return null;

  return AdClickSchema.parse({
    provider,
    kind: candidate.kind,
    value: value.data,
    clickedAt: clickedAt.toISOString(),
  });
}

const INTERNAL_URL_BASE = "https://internal.invalid";

function withinPendingWindow(pendingAt: Date, now: Date): boolean {
  const age = now.getTime() - pendingAt.getTime();
  return (
    age >= -PUBLIC_AD_ATTRIBUTION_PENDING_FUTURE_SKEW_SECONDS * 1000 &&
    age <= PUBLIC_AD_ATTRIBUTION_PENDING_MAX_AGE_SECONDS * 1000
  );
}

function pendingMarkerDate(value: string, now: Date): Date | null {
  if (!/^\d+$/.test(value)) return null;
  const milliseconds = Number(value) * 1000;
  if (!Number.isSafeInteger(milliseconds)) return null;

  const pendingAt = new Date(milliseconds);
  return withinPendingWindow(pendingAt, now) ? pendingAt : null;
}

function explicitPendingDate(input: unknown, now: Date): Date | null {
  const parsed = PublicAdAttributionVisitInputSchema.safeParse(input);
  if (!parsed.success) return null;

  const pendingAt = new Date(parsed.data.pendingAt);
  return withinPendingWindow(pendingAt, now) ? pendingAt : null;
}

export function hasAdAttributionPendingMarker(input: unknown): boolean {
  const parsed = PublicAdAttributionSearchInputSchema.safeParse(input);
  if (!parsed.success) return false;

  return searchParams(parsed.data.search).has(PUBLIC_AD_ATTRIBUTION_PENDING_PARAM);
}

export function normalizePendingAdClick(input: unknown, now = new Date()): AdClick | null {
  const parsed = PublicAdAttributionSearchInputSchema.safeParse(input);
  if (!parsed.success) return null;

  const markers = searchParams(parsed.data.search).getAll(PUBLIC_AD_ATTRIBUTION_PENDING_PARAM);
  const marker = markers.length === 1 ? markers[0] : undefined;
  if (!marker) return null;

  const pendingAt = pendingMarkerDate(marker, now);
  return pendingAt ? normalizeAdClick(parsed.data, pendingAt) : null;
}

export function hasPendingAdClick(input: unknown, now = new Date()): boolean {
  return normalizePendingAdClick(input, now) !== null;
}

export function normalizePublicAdVisitClick(input: unknown, now = new Date()): AdClick | null {
  const parsed = PublicAdAttributionVisitInputSchema.safeParse(input);
  if (!parsed.success) return null;

  const pendingAt = explicitPendingDate(parsed.data, now);
  return pendingAt ? normalizeAdClick(parsed.data, pendingAt) : null;
}

export function preserveAdClickInHref(href: string, input: unknown, now = new Date()): string {
  const click = normalizeAdClick(input);
  if (!click) return href;

  const hadMarker = hasAdAttributionPendingMarker(input);
  const markedClick = normalizePendingAdClick(input, now);
  if (hadMarker && !markedClick) return href;

  const hasExplicitPendingAt = typeof input === "object" && input !== null && Object.hasOwn(input, "pendingAt");
  const explicitPendingAt = explicitPendingDate(input, now);
  if (hasExplicitPendingAt && !explicitPendingAt) return href;

  const pendingAt = markedClick ? new Date(markedClick.clickedAt) : (explicitPendingAt ?? now);
  const pendingMarker = Math.floor(pendingAt.getTime() / 1000).toString();

  const target = new URL(href, INTERNAL_URL_BASE);
  if (target.origin !== INTERNAL_URL_BASE) return href;

  const targetClick = normalizeAdClick({ search: target.search });
  const markers = target.searchParams.getAll(PUBLIC_AD_ATTRIBUTION_PENDING_PARAM);
  if (
    targetClick?.kind === click.kind &&
    targetClick.value === click.value &&
    markers.length === 1 &&
    markers[0] === pendingMarker
  )
    return href;

  for (const kind of AD_IDENTIFIER_KINDS) target.searchParams.delete(kind);
  target.searchParams.delete(PUBLIC_AD_ATTRIBUTION_PENDING_PARAM);
  target.searchParams.set(click.kind, click.value);
  target.searchParams.set(PUBLIC_AD_ATTRIBUTION_PENDING_PARAM, pendingMarker);
  return `${target.pathname}${target.search}${target.hash}`;
}

export function removeAdClickFromHref(href: string): string {
  const target = new URL(href, INTERNAL_URL_BASE);
  if (target.origin !== INTERNAL_URL_BASE) return href;

  for (const kind of AD_IDENTIFIER_KINDS) target.searchParams.delete(kind);
  target.searchParams.delete(PUBLIC_AD_ATTRIBUTION_PENDING_PARAM);
  return `${target.pathname}${target.search}${target.hash}`;
}

function retainClick(click: AdClick, now: Date): RetainedAdClick {
  const clickedAt = new Date(click.clickedAt);
  return RetainedAdClickSchema.parse({
    ...click,
    capturedAt: now.toISOString(),
    expiresAt: adClickExpiresAt(click.provider, clickedAt).toISOString(),
  });
}

export function mergeRetainedAdClicks(
  existing: readonly RetainedAdClick[],
  incoming: AdClick,
  now: Date,
): RetainedAdClick[] | null {
  const retained = retainClick(incoming, now);
  const previous = existing.find((entry) => entry.provider === retained.provider);
  if (previous && new Date(previous.clickedAt).getTime() >= new Date(retained.clickedAt).getTime()) return null;

  return [...existing.filter((entry) => entry.provider !== retained.provider), retained];
}

export function isConsentForNotice(consent: PublicAdAttributionConsent, noticeVersion: string): boolean {
  return consent.noticeVersion === noticeVersion;
}

export function activeRetainedAdClicks(clicks: readonly RetainedAdClick[], now: Date): RetainedAdClick[] {
  return clicks.filter((click) => new Date(click.expiresAt).getTime() > now.getTime());
}

export function buildPublicAdAttributionCookieDecision(args: {
  existing: PublicAdAttributionCookie | null;
  input: z.output<typeof PublicAdAttributionDecisionInputSchema>;
  noticeVersion: string;
  now: Date;
}): PublicAdAttributionCookie {
  const advertising = args.input.choice === "allow-attribution";
  const existingAllowed =
    args.existing?.consent.advertising === true && isConsentForNotice(args.existing.consent, args.noticeVersion)
      ? args.existing
      : null;
  const consent =
    advertising && existingAllowed
      ? existingAllowed.consent
      : { advertising, decidedAt: args.now.toISOString(), noticeVersion: args.noticeVersion };
  const expiresAt =
    advertising && existingAllowed
      ? existingAllowed.expiresAt
      : new Date(args.now.getTime() + PUBLIC_AD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS * 1000).toISOString();

  const visitClick = args.input.visit ? normalizePublicAdVisitClick(args.input.visit, args.now) : null;
  const retained = advertising ? activeRetainedAdClicks(existingAllowed?.clicks ?? [], args.now) : [];
  const merged = advertising && visitClick ? mergeRetainedAdClicks(retained, visitClick, args.now) : null;
  const clicks = merged ?? retained;

  return PublicAdAttributionCookieSchema.parse({ version: 1, consent, clicks, expiresAt });
}
