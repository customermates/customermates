import type { PublicAdAttributionCookie } from "./ad-attribution.schema";

import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";
import { PublicAdAttributionCookieSchema } from "./ad-attribution.schema";

export const AD_ATTRIBUTION_COOKIE_VALUE_MAX_BYTES = 4_096;

export function adAttributionSigningSecret(secret: string | undefined): string | null {
  const trimmed = secret?.trim();
  return trimmed ? `ad-attribution:v1:${trimmed}` : null;
}

export function encodePublicAdAttributionCookie(value: PublicAdAttributionCookie, secret: string): string | null {
  const payload = Buffer.from(JSON.stringify(PublicAdAttributionCookieSchema.parse(value))).toString("base64url");
  const encoded = `${payload}.${hmacSha256Hex(secret, payload)}`;
  return Buffer.byteLength(encoded, "utf8") > AD_ATTRIBUTION_COOKIE_VALUE_MAX_BYTES ? null : encoded;
}

export function decodePublicAdAttributionCookie(
  value: string | undefined,
  secret: string,
  now = new Date(),
): PublicAdAttributionCookie | null {
  if (!value || Buffer.byteLength(value, "utf8") > AD_ATTRIBUTION_COOKIE_VALUE_MAX_BYTES) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature || !/^[0-9a-f]{64}$/u.test(signature)) return null;

  try {
    if (!verifyHmacSha256Hex(secret, payload, signature)) return null;
    const parsed = PublicAdAttributionCookieSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (!parsed.success || new Date(parsed.data.expiresAt).getTime() <= now.getTime()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
