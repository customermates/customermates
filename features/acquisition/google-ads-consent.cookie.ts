import { cookies } from "next/headers";

import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";
import { env } from "@/env";
import {
  GOOGLE_ADS_CLICK_ID_RETENTION_SECONDS,
  PUBLIC_GOOGLE_ADS_COOKIE_MAX_AGE_SECONDS,
  PUBLIC_GOOGLE_ADS_COOKIE_NAME,
  PublicGoogleAdsCookieSchema,
  type PublicGoogleAdsCookie,
  type RegistrationGoogleAdsAttribution,
} from "./google-ads-consent.schema";

const COOKIE_VALUE_MAX_BYTES = 2_048;

function signingSecret(): string | null {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  return secret ? `google-ads-attribution:v1:${secret}` : null;
}

export function encodePublicGoogleAdsCookie(value: PublicGoogleAdsCookie, secret: string): string {
  const payload = Buffer.from(JSON.stringify(PublicGoogleAdsCookieSchema.parse(value))).toString("base64url");
  const encoded = `${payload}.${hmacSha256Hex(secret, payload)}`;
  if (Buffer.byteLength(encoded, "utf8") > COOKIE_VALUE_MAX_BYTES)
    throw new Error("Google Ads attribution cookie exceeds its byte budget");
  return encoded;
}

export function decodePublicGoogleAdsCookie(value: string | undefined, secret: string): PublicGoogleAdsCookie | null {
  if (!value || Buffer.byteLength(value, "utf8") > COOKIE_VALUE_MAX_BYTES) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature || !/^[0-9a-f]{64}$/u.test(signature)) return null;

  try {
    if (!verifyHmacSha256Hex(secret, payload, signature)) return null;
    const parsed = PublicGoogleAdsCookieSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (!parsed.success || new Date(parsed.data.expiresAt).getTime() <= Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function readPublicGoogleAdsCookie(): Promise<PublicGoogleAdsCookie | null> {
  if (env.APP_MODE !== "cloud") return null;
  const secret = signingSecret();
  if (!secret) return null;
  const cookieStore = await cookies();
  return decodePublicGoogleAdsCookie(cookieStore.get(PUBLIC_GOOGLE_ADS_COOKIE_NAME)?.value, secret);
}

export async function writePublicGoogleAdsCookie(value: PublicGoogleAdsCookie): Promise<boolean> {
  if (env.APP_MODE !== "cloud") return false;
  const secret = signingSecret();
  if (!secret) return false;
  const remainingSeconds = Math.max(
    0,
    Math.min(
      PUBLIC_GOOGLE_ADS_COOKIE_MAX_AGE_SECONDS,
      Math.floor((new Date(value.expiresAt).getTime() - Date.now()) / 1_000),
    ),
  );
  if (remainingSeconds === 0) return false;

  const cookieStore = await cookies();
  cookieStore.set(PUBLIC_GOOGLE_ADS_COOKIE_NAME, encodePublicGoogleAdsCookie(value, secret), {
    httpOnly: true,
    maxAge: remainingSeconds,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });
  return true;
}

export async function readRegistrationGoogleAdsAttribution(): Promise<RegistrationGoogleAdsAttribution | null> {
  const cookie = await readPublicGoogleAdsCookie();
  if (!cookie?.consent.advertising || !cookie.click) return null;

  const capturedAt = new Date(cookie.click.capturedAt);
  const cookieExpiresAt = new Date(cookie.expiresAt);
  const retentionExpiresAt = new Date(capturedAt.getTime() + GOOGLE_ADS_CLICK_ID_RETENTION_SECONDS * 1_000);
  const attribution = {
    clickId: cookie.click.value,
    clickIdKind: cookie.click.kind,
    capturedAt,
    consentedAt: new Date(cookie.consent.decidedAt),
    expiresAt: cookieExpiresAt < retentionExpiresAt ? cookieExpiresAt : retentionExpiresAt,
  } satisfies RegistrationGoogleAdsAttribution;
  if (attribution.expiresAt.getTime() <= Date.now()) return null;
  return attribution;
}

export async function clearRegisteredGoogleAdsClickFromCookie(): Promise<void> {
  const cookie = await readPublicGoogleAdsCookie();
  if (!cookie?.click) return;
  await writePublicGoogleAdsCookie({ ...cookie, click: null });
}
