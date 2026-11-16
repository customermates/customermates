import type { TokenBucketRateLimiter } from "./token-bucket-rate-limiter";

export type PublicRateLimited = { status: "rateLimited"; retryAfterSeconds: number };

export type PublicBlocked = { status: "unavailable" } | PublicRateLimited;

export function admitAll(
  limiters: ReadonlyArray<readonly [TokenBucketRateLimiter, string | null]>,
): PublicRateLimited | null {
  for (const [limiter, key] of limiters) {
    if (!key) continue;
    const admission = limiter.admit(key);
    if (!admission.allowed) return { status: "rateLimited", retryAfterSeconds: admission.retryAfterSeconds };
  }
  return null;
}
