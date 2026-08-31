import { z } from "zod";

export const PUBLIC_GOOGLE_ADS_COOKIE_NAME = "cm_google_ads_attribution";
export const PUBLIC_GOOGLE_ADS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
export const GOOGLE_ADS_CLICK_ID_RETENTION_SECONDS = 60 * 60 * 24 * 89;
export const PUBLIC_GOOGLE_ADS_PENDING_PARAM = "cm_ads_pending";
export const PUBLIC_GOOGLE_ADS_PENDING_MAX_AGE_SECONDS = 60 * 60 * 24;
export const PUBLIC_GOOGLE_ADS_PENDING_FUTURE_SKEW_SECONDS = 60 * 5;

export const GoogleAdsClickIdKindSchema = z.enum(["gclid", "gbraid", "wbraid"]);
export type GoogleAdsClickIdKind = z.infer<typeof GoogleAdsClickIdKindSchema>;

const clickIdValueSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[^\p{Cc}\p{Cf}\p{Z}]+$/u);

export const GoogleAdsClickSchema = z.object({
  kind: GoogleAdsClickIdKindSchema,
  value: clickIdValueSchema,
  capturedAt: z.iso.datetime(),
});
export type GoogleAdsClick = z.infer<typeof GoogleAdsClickSchema>;

export const PublicGoogleAdsConsentSchema = z.object({
  advertising: z.boolean(),
  decidedAt: z.iso.datetime(),
});
export type PublicGoogleAdsConsent = z.infer<typeof PublicGoogleAdsConsentSchema>;

export const PublicGoogleAdsCookieSchema = z.object({
  version: z.literal(1),
  consent: PublicGoogleAdsConsentSchema,
  click: GoogleAdsClickSchema.nullable(),
  expiresAt: z.iso.datetime(),
});
export type PublicGoogleAdsCookie = z.infer<typeof PublicGoogleAdsCookieSchema>;

const PublicGoogleAdsSearchInputSchema = z.object({
  search: z.string().max(2048),
});
export const PublicGoogleAdsVisitInputSchema = PublicGoogleAdsSearchInputSchema.extend({
  pendingAt: z.iso.datetime(),
});
export type PublicGoogleAdsVisitInput = z.infer<typeof PublicGoogleAdsVisitInputSchema>;

export const PublicGoogleAdsConsentDecisionInputSchema = z.object({
  choice: z.enum(["allow-attribution", "necessary-only"]),
  visit: PublicGoogleAdsVisitInputSchema.nullable(),
});
export type PublicGoogleAdsConsentDecisionInput = z.input<typeof PublicGoogleAdsConsentDecisionInputSchema>;

export const RegistrationGoogleAdsAttributionSchema = z
  .object({
    clickId: clickIdValueSchema,
    clickIdKind: GoogleAdsClickIdKindSchema,
    capturedAt: z.date(),
    consentedAt: z.date(),
    expiresAt: z.date(),
  })
  .refine((value) => value.consentedAt <= value.capturedAt, {
    message: "Google Ads click capture cannot predate consent",
    path: ["consentedAt"],
  })
  .refine((value) => value.expiresAt > value.capturedAt, {
    message: "Google Ads click expiry must follow capture",
    path: ["expiresAt"],
  });
export type RegistrationGoogleAdsAttribution = z.infer<typeof RegistrationGoogleAdsAttributionSchema>;

export function normalizeGoogleAdsClick(input: unknown, capturedAt = new Date()): GoogleAdsClick | null {
  const parsed = PublicGoogleAdsSearchInputSchema.safeParse(input);
  if (!parsed.success) return null;

  const search = parsed.data.search.startsWith("?") ? parsed.data.search.slice(1) : parsed.data.search;
  const params = new URLSearchParams(search);
  const candidates = GoogleAdsClickIdKindSchema.options.flatMap((kind) =>
    params.getAll(kind).map((value) => ({ kind, value })),
  );
  if (candidates.length !== 1) return null;
  const value = clickIdValueSchema.safeParse(candidates[0]?.value);
  if (!value.success) return null;

  return GoogleAdsClickSchema.parse({
    kind: candidates[0]?.kind,
    value: value.data,
    capturedAt: capturedAt.toISOString(),
  });
}

const INTERNAL_URL_BASE = "https://internal.invalid";

function pendingMarkerDate(value: string, now: Date): Date | null {
  if (!/^\d+$/.test(value)) return null;
  const milliseconds = Number(value) * 1000;
  if (!Number.isSafeInteger(milliseconds)) return null;

  const pendingAt = new Date(milliseconds);
  const age = now.getTime() - pendingAt.getTime();
  if (
    age < -PUBLIC_GOOGLE_ADS_PENDING_FUTURE_SKEW_SECONDS * 1000 ||
    age > PUBLIC_GOOGLE_ADS_PENDING_MAX_AGE_SECONDS * 1000
  )
    return null;
  return pendingAt;
}

function explicitPendingDate(input: unknown, now: Date): Date | null {
  const parsed = PublicGoogleAdsVisitInputSchema.safeParse(input);
  if (!parsed.success) return null;

  const pendingAt = new Date(parsed.data.pendingAt);
  const age = now.getTime() - pendingAt.getTime();
  if (
    age < -PUBLIC_GOOGLE_ADS_PENDING_FUTURE_SKEW_SECONDS * 1000 ||
    age > PUBLIC_GOOGLE_ADS_PENDING_MAX_AGE_SECONDS * 1000
  )
    return null;
  return pendingAt;
}

export function hasGoogleAdsPendingMarker(input: unknown): boolean {
  const parsed = PublicGoogleAdsSearchInputSchema.safeParse(input);
  if (!parsed.success) return false;

  const search = parsed.data.search.startsWith("?") ? parsed.data.search.slice(1) : parsed.data.search;
  return new URLSearchParams(search).has(PUBLIC_GOOGLE_ADS_PENDING_PARAM);
}

export function normalizePendingGoogleAdsClick(input: unknown, now = new Date()): GoogleAdsClick | null {
  const parsed = PublicGoogleAdsSearchInputSchema.safeParse(input);
  if (!parsed.success) return null;

  const search = parsed.data.search.startsWith("?") ? parsed.data.search.slice(1) : parsed.data.search;
  const pendingMarkers = new URLSearchParams(search).getAll(PUBLIC_GOOGLE_ADS_PENDING_PARAM);
  if (pendingMarkers.length !== 1 || !pendingMarkers[0]) return null;

  const pendingAt = pendingMarkerDate(pendingMarkers[0], now);
  return pendingAt ? normalizeGoogleAdsClick(parsed.data, pendingAt) : null;
}

export function hasPendingGoogleAdsClick(input: unknown, now = new Date()): boolean {
  return normalizePendingGoogleAdsClick(input, now) !== null;
}

export function normalizePublicGoogleAdsVisitClick(input: unknown, now = new Date()): GoogleAdsClick | null {
  const parsed = PublicGoogleAdsVisitInputSchema.safeParse(input);
  if (!parsed.success) return null;

  const pendingAt = explicitPendingDate(parsed.data, now);
  return pendingAt ? normalizeGoogleAdsClick(parsed.data, now) : null;
}

export function preserveGoogleAdsClickInHref(href: string, input: unknown, now = new Date()): string {
  const click = normalizeGoogleAdsClick(input);
  if (!click) return href;

  const hadMarker = hasGoogleAdsPendingMarker(input);
  const markedClick = normalizePendingGoogleAdsClick(input, now);
  if (hadMarker && !markedClick) return href;
  const hasExplicitPendingAt = typeof input === "object" && input !== null && Object.hasOwn(input, "pendingAt");
  const explicitPendingAt = explicitPendingDate(input, now);
  if (hasExplicitPendingAt && !explicitPendingAt) return href;
  const pendingAt = markedClick ? new Date(markedClick.capturedAt) : (explicitPendingAt ?? now);
  const pendingMarker = Math.floor(pendingAt.getTime() / 1000).toString();

  const target = new URL(href, INTERNAL_URL_BASE);
  if (target.origin !== INTERNAL_URL_BASE) return href;

  const targetClick = normalizeGoogleAdsClick({ search: target.search });
  const pendingMarkers = target.searchParams.getAll(PUBLIC_GOOGLE_ADS_PENDING_PARAM);
  if (
    targetClick?.kind === click.kind &&
    targetClick.value === click.value &&
    pendingMarkers.length === 1 &&
    pendingMarkers[0] === pendingMarker
  )
    return href;

  for (const kind of GoogleAdsClickIdKindSchema.options) target.searchParams.delete(kind);
  target.searchParams.delete(PUBLIC_GOOGLE_ADS_PENDING_PARAM);
  target.searchParams.set(click.kind, click.value);
  target.searchParams.set(PUBLIC_GOOGLE_ADS_PENDING_PARAM, pendingMarker);
  return `${target.pathname}${target.search}${target.hash}`;
}

export function removeGoogleAdsClickFromHref(href: string): string {
  const target = new URL(href, INTERNAL_URL_BASE);
  if (target.origin !== INTERNAL_URL_BASE) return href;

  for (const kind of GoogleAdsClickIdKindSchema.options) target.searchParams.delete(kind);
  target.searchParams.delete(PUBLIC_GOOGLE_ADS_PENDING_PARAM);
  return `${target.pathname}${target.search}${target.hash}`;
}

export function buildPublicGoogleAdsCookieDecision(args: {
  existing: PublicGoogleAdsCookie | null;
  input: z.output<typeof PublicGoogleAdsConsentDecisionInputSchema>;
  now: Date;
}): PublicGoogleAdsCookie {
  const advertising = args.input.choice === "allow-attribution";
  const existingAllowed = args.existing?.consent.advertising === true ? args.existing : null;
  const consent =
    advertising && existingAllowed ? existingAllowed.consent : { advertising, decidedAt: args.now.toISOString() };
  const expiresAt =
    advertising && existingAllowed
      ? existingAllowed.expiresAt
      : new Date(args.now.getTime() + PUBLIC_GOOGLE_ADS_COOKIE_MAX_AGE_SECONDS * 1000).toISOString();
  const visitClick = args.input.visit ? normalizePublicGoogleAdsVisitClick(args.input.visit, args.now) : null;

  return PublicGoogleAdsCookieSchema.parse({
    version: 1,
    consent,
    click: advertising ? (existingAllowed?.click ?? visitClick) : null,
    expiresAt,
  });
}
