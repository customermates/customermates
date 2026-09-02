import { cookies } from "next/headers";

import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";
import { env } from "@/env";
import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import {
  PUBLIC_AD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
  PUBLIC_AD_ATTRIBUTION_COOKIE_NAME,
  PublicAdAttributionCookieSchema,
  activeRetainedAdClicks,
  isConsentForNotice,
  type PublicAdAttributionCookie,
  type RegistrationAdAttribution,
} from "./ad-attribution.schema";

const COOKIE_VALUE_MAX_BYTES = 4_096;

function signingSecret(): string | null {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  return secret ? `ad-attribution:v1:${secret}` : null;
}

export function encodePublicAdAttributionCookie(value: PublicAdAttributionCookie, secret: string): string {
  const payload = Buffer.from(JSON.stringify(PublicAdAttributionCookieSchema.parse(value))).toString("base64url");
  const encoded = `${payload}.${hmacSha256Hex(secret, payload)}`;
  if (Buffer.byteLength(encoded, "utf8") > COOKIE_VALUE_MAX_BYTES)
    throw new Error("Ad attribution cookie exceeds its byte budget");
  return encoded;
}

export function decodePublicAdAttributionCookie(
  value: string | undefined,
  secret: string,
): PublicAdAttributionCookie | null {
  if (!value || Buffer.byteLength(value, "utf8") > COOKIE_VALUE_MAX_BYTES) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature || !/^[0-9a-f]{64}$/u.test(signature)) return null;

  try {
    if (!verifyHmacSha256Hex(secret, payload, signature)) return null;
    const parsed = PublicAdAttributionCookieSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (!parsed.success || new Date(parsed.data.expiresAt).getTime() <= Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function readPublicAdAttributionCookie(): Promise<PublicAdAttributionCookie | null> {
  if (env.APP_MODE !== "cloud") return null;
  const secret = signingSecret();
  if (!secret) return null;
  const cookieStore = await cookies();
  return decodePublicAdAttributionCookie(cookieStore.get(PUBLIC_AD_ATTRIBUTION_COOKIE_NAME)?.value, secret);
}

export async function writePublicAdAttributionCookie(value: PublicAdAttributionCookie): Promise<boolean> {
  if (env.APP_MODE !== "cloud") return false;
  const secret = signingSecret();
  if (!secret) return false;
  const remainingSeconds = Math.max(
    0,
    Math.min(
      PUBLIC_AD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
      Math.floor((new Date(value.expiresAt).getTime() - Date.now()) / 1_000),
    ),
  );
  if (remainingSeconds === 0) return false;

  const cookieStore = await cookies();
  cookieStore.set(PUBLIC_AD_ATTRIBUTION_COOKIE_NAME, encodePublicAdAttributionCookie(value, secret), {
    httpOnly: true,
    maxAge: remainingSeconds,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });
  return true;
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

export async function readRegistrationAdAttribution(): Promise<RegistrationAdAttribution[]> {
  const cookie = await readPublicAdAttributionCookie();
  if (!cookie) return [];
  const now = new Date();
  return registrationAdAttributionFromCookie(cookie, now).filter(
    (attribution) => attribution.expiresAt.getTime() > now.getTime(),
  );
}

export async function clearRegisteredAdClicksFromCookie(): Promise<void> {
  const cookie = await readPublicAdAttributionCookie();
  if (!cookie || cookie.clicks.length === 0) return;
  await writePublicAdAttributionCookie({ ...cookie, clicks: [] });
}
