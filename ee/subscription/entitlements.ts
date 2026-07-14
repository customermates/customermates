import type { SubscriptionPlan } from "@/generated/prisma";

import { SubscriptionStatus } from "@/generated/prisma";

export type PlanEntitlements = {
  messaging: boolean;
  includedAccountsPerUser: number | "unlimited";
  sharedAccounts: boolean;
};

export type EntitlementFeature = "messaging" | "sharedAccounts";

const PLAN_ENTITLEMENTS: Record<SubscriptionPlan, PlanEntitlements> = {
  starter: { messaging: false, includedAccountsPerUser: 0, sharedAccounts: false },
  pro: { messaging: true, includedAccountsPerUser: 1, sharedAccounts: false },
  business: { messaging: true, includedAccountsPerUser: 3, sharedAccounts: true },
  enterprise: { messaging: true, includedAccountsPerUser: "unlimited", sharedAccounts: true },
};

export function getEntitlements(plan: SubscriptionPlan): PlanEntitlements {
  return PLAN_ENTITLEMENTS[plan];
}

export function getEffectiveEntitlements(input: { cloudHosted: boolean; plan: SubscriptionPlan }): PlanEntitlements {
  if (!input.cloudHosted) return PLAN_ENTITLEMENTS.starter;

  return getEntitlements(input.plan);
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

export function isSubscriptionUsable(subscription: { status: SubscriptionStatus; trialEndDate: Date | null }): boolean {
  if (subscription.status === SubscriptionStatus.active) return true;

  return (
    subscription.status === SubscriptionStatus.trial &&
    (subscription.trialEndDate === null || subscription.trialEndDate >= new Date())
  );
}
