import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/env";

export const UNIPILE_AUTH_HEADER = "x-unipile-auth";

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = new Uint8Array(createHash("sha256").update(a).digest());
  const bBuf = new Uint8Array(createHash("sha256").update(b).digest());
  return timingSafeEqual(aBuf, bBuf);
}

export function verifyUnipileWebhookSignature(headerValue: string | null): boolean {
  if (!env.UNIPILE_WEBHOOK_SECRET) return false;
  if (!headerValue) return false;

  return constantTimeEquals(headerValue, env.UNIPILE_WEBHOOK_SECRET);
}

export function signHostedAuthName(name: string): string {
  return createHmac("sha256", env.UNIPILE_WEBHOOK_SECRET ?? "")
    .update(name)
    .digest("hex");
}

export function verifyHostedAuthToken(name: string | null | undefined, token: string | null | undefined): boolean {
  if (!env.UNIPILE_WEBHOOK_SECRET) return false;
  if (!name || !token) return false;

  return constantTimeEquals(token, signHostedAuthName(name));
}
