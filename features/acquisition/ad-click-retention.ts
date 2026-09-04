import type {
  AdClick,
  PublicAdAttributionConsent,
  PublicAdAttributionCookie,
  RegistrationAdAttribution,
  RetainedAdClick,
} from "./ad-attribution.schema";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { RetainedAdClickSchema } from "./ad-attribution.schema";
import { adClickExpiresAt } from "./ad-provider-registry";

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

export function activeRetainedAdClicks(clicks: readonly RetainedAdClick[], now: Date): RetainedAdClick[] {
  return clicks.filter((click) => new Date(click.expiresAt).getTime() > now.getTime());
}

export function isConsentForNotice(consent: PublicAdAttributionConsent, noticeVersion: string): boolean {
  return consent.noticeVersion === noticeVersion;
}

export function registrationAdAttributionFromCookie(
  cookie: PublicAdAttributionCookie,
  now: Date,
): RegistrationAdAttribution[] {
  if (!cookie.consent.advertising || !isConsentForNotice(cookie.consent, AD_ATTRIBUTION_NOTICE_VERSION)) return [];

  const cookieExpiresAt = new Date(cookie.expiresAt);

  return activeRetainedAdClicks(cookie.clicks, now).map((click) => {
    const retentionExpiresAt = new Date(click.expiresAt);
    return {
      provider: click.provider,
      identifierKind: click.kind,
      identifierValue: click.value,
      clickedAt: new Date(click.clickedAt),
      capturedAt: new Date(click.capturedAt),
      consentedAt: new Date(cookie.consent.decidedAt),
      consentNoticeVersion: cookie.consent.noticeVersion,
      expiresAt: cookieExpiresAt < retentionExpiresAt ? cookieExpiresAt : retentionExpiresAt,
    } satisfies RegistrationAdAttribution;
  });
}
