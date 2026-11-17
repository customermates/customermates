import { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";

export const COMPOSE_SENTENCES_PER_HOUR = 20;

const HOUR_MS = 60 * 60 * 1000;

export const composeRateLimiter = new TokenBucketRateLimiter(COMPOSE_SENTENCES_PER_HOUR, HOUR_MS);

export function composeRateLimitKey(companyId: string, userId: string): string {
  return `${companyId}:${userId}`;
}
