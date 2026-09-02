import type { AdClick } from "./ad-attribution.schema";

import {
  AdClickSchema,
  PUBLIC_AD_ATTRIBUTION_PENDING_FUTURE_SKEW_SECONDS,
  PUBLIC_AD_ATTRIBUTION_PENDING_MAX_AGE_SECONDS,
  PUBLIC_AD_ATTRIBUTION_PENDING_PARAM,
  PublicAdAttributionSearchInputSchema,
  PublicAdAttributionVisitInputSchema,
  adIdentifierValueSchema,
} from "./ad-attribution.schema";
import { AD_IDENTIFIER_KINDS, adProviderForIdentifierKind } from "./ad-provider-registry";

const INTERNAL_URL_BASE = "https://internal.invalid";

function searchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

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

  const value = adIdentifierValueSchema.safeParse(candidate.value);
  if (!value.success) return null;

  return AdClickSchema.parse({
    provider,
    kind: candidate.kind,
    value: value.data,
    clickedAt: clickedAt.toISOString(),
  });
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
