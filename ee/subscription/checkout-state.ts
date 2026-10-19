export const CHECKOUT_PENDING_MS = 15 * 60 * 1000;
export const CHECKOUT_OVERDUE_MS = 24 * 60 * 60 * 1000;
export const CHECKOUT_POLL_INTERVAL_MS = 3_000;

export const CHECKOUT_STATES = ["none", "pending", "overdue"] as const;

export type CheckoutState = (typeof CHECKOUT_STATES)[number];

export function checkoutStateOf(startedAt: Date | null, now = new Date()): CheckoutState {
  if (!startedAt) return "none";
  const age = now.getTime() - startedAt.getTime();
  if (age < CHECKOUT_PENDING_MS) return "pending";
  return age < CHECKOUT_OVERDUE_MS ? "overdue" : "none";
}

export function checkoutPendingSince(now: Date): Date {
  return new Date(now.getTime() - CHECKOUT_PENDING_MS);
}

export function checkoutExpiresAt(startedAt: Date): Date {
  return new Date(startedAt.getTime() + CHECKOUT_PENDING_MS);
}
