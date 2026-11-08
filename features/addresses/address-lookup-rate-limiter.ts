import { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";

export class AddressLookupRateLimiter extends TokenBucketRateLimiter {
  constructor(capacity = 30, windowMs = 10_000, maxKeys?: number, now?: () => number) {
    super(capacity, windowMs, maxKeys, now);
  }
}
