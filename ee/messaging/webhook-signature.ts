import { env } from "@/env";

import { hmacSha256Hex, verifyHmacSha256Hex } from "@/core/utils/hmac";

export function signHostedAuthState(userId: string): string {
  return `${userId}.${hmacSha256Hex(env.UNIPILE_WEBHOOK_SECRET ?? "", userId)}`;
}

export function verifyHostedAuthState(state: string | null | undefined): string | null {
  if (!state || !env.UNIPILE_WEBHOOK_SECRET) return null;

  const separator = state.lastIndexOf(".");
  if (separator <= 0) return null;

  const userId = state.slice(0, separator);
  const token = state.slice(separator + 1);

  if (!verifyHmacSha256Hex(env.UNIPILE_WEBHOOK_SECRET, userId, token)) return null;

  return userId;
}
