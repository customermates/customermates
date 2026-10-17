export const UNSIGNED_CHECKOUT_CLAIMS_END = new Date("2026-10-20T00:00:00.000Z");

export function acceptsUnsignedCheckoutClaim(subscriptionCreatedAt: Date | null): boolean {
  return subscriptionCreatedAt !== null && subscriptionCreatedAt.getTime() < UNSIGNED_CHECKOUT_CLAIMS_END.getTime();
}
