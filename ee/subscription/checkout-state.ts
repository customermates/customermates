export const CHECKOUT_PENDING_MS = 15 * 60 * 1000;
export const CHECKOUT_POLL_INTERVAL_MS = 3_000;

export const CHECKOUT_STATES = ["none", "pending", "overdue"] as const;

export type CheckoutState = (typeof CHECKOUT_STATES)[number];

export function checkoutStateOf(startedAt: Date | null, now = new Date()): CheckoutState {
  if (!startedAt) return "none";
  return now.getTime() - startedAt.getTime() < CHECKOUT_PENDING_MS ? "pending" : "overdue";
}

export function checkoutPendingSince(now: Date): Date {
  return new Date(now.getTime() - CHECKOUT_PENDING_MS);
}
