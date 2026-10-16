import { SubscriptionStatus } from "@/generated/prisma";

const LIVE_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.active,
  SubscriptionStatus.trial,
  SubscriptionStatus.pastDue,
]);

export function hasLiveSubscription<T extends { lemonSqueezyId: string | null; status: SubscriptionStatus }>(
  subscription: T,
): subscription is T & { lemonSqueezyId: string } {
  return subscription.lemonSqueezyId !== null && LIVE_STATUSES.has(subscription.status);
}
