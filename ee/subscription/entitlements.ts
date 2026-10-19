import type { PlanEntitlements } from "@/core/commercial/plan-catalog";
import type { AppMode } from "@/core/config/environment";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { PLAN_CATALOG } from "@/core/commercial/plan-catalog";

export type { PlanEntitlements } from "@/core/commercial/plan-catalog";

export type EntitlementFeature = "agentChat" | "messaging" | "sharedAccounts";

export const TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER = 500;

const LIVE_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.active,
  SubscriptionStatus.trial,
  SubscriptionStatus.pastDue,
]);

export function getEntitlements(plan: SubscriptionPlan): PlanEntitlements {
  return PLAN_CATALOG[plan].entitlements;
}

export function getEffectiveEntitlements(input: { appMode: AppMode; plan: SubscriptionPlan }): PlanEntitlements {
  if (input.appMode === "self-hosted") {
    return {
      ...PLAN_CATALOG.starter.entitlements,
      hostedAiCreditsPerActiveUser: null,
      fileStorageBytesPerActiveUser: null,
    };
  }

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

export function hasLiveSubscription<T extends { lemonSqueezyId: string | null; status: SubscriptionStatus }>(
  subscription: T,
): subscription is T & { lemonSqueezyId: string } {
  return subscription.lemonSqueezyId !== null && LIVE_SUBSCRIPTION_STATUSES.has(subscription.status);
}

export function isAwaitingFirstPlan(subscription: {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  lemonSqueezyId: string | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
}): boolean {
  return (
    subscription.status === SubscriptionStatus.expired &&
    subscription.plan !== SubscriptionPlan.enterprise &&
    !subscription.lemonSqueezyId &&
    subscription.trialEndDate === null &&
    subscription.currentPeriodEnd === null
  );
}
