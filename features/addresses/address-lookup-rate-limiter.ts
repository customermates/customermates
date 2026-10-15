type Bucket = { tokens: number; refilledAt: number };

export type AddressLookupAdmission = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class AddressLookupRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity = 30,
    private readonly windowMs = 10_000,
    private readonly maxKeys = 10_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  admit(key: string): AddressLookupAdmission {
    const now = this.now();
    const refillPerMs = this.capacity / this.windowMs;
    const current = this.buckets.get(key);
    const tokens = current
      ? Math.min(this.capacity, current.tokens + (now - current.refilledAt) * refillPerMs)
      : this.capacity;
    this.buckets.delete(key);
    if (tokens < 1) {
      this.buckets.set(key, { tokens, refilledAt: now });
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1_000)) };
    }
    this.buckets.set(key, { tokens: tokens - 1, refilledAt: now });
    if (this.buckets.size > this.maxKeys) this.buckets.delete(this.buckets.keys().next().value as string);
    return { allowed: true };
  }
}
