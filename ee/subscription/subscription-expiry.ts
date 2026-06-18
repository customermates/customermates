import { SubscriptionStatus } from "@/generated/prisma";

export function isPaidSubscription(status: SubscriptionStatus): boolean {
  return status === SubscriptionStatus.active;
}

export function isSubscriptionExpired(subscription: {
  status: SubscriptionStatus;
  trialEndDate: Date | null;
}): boolean {
  return (
    subscription.status === SubscriptionStatus.unPaid ||
    subscription.status === SubscriptionStatus.expired ||
    (subscription.status === SubscriptionStatus.trial &&
      subscription.trialEndDate !== null &&
      subscription.trialEndDate < new Date())
  );
}
