import type { PlanEntitlements, PlanId } from "@/core/commercial/plan-catalog";
import type { AppMode } from "@/core/config/environment";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";
import { FREE_PLAN_ID, PLAN_CATALOG } from "@/core/commercial/plan-catalog";

export type EntitlementFeature = "agentChat" | "messaging" | "sharedAccounts";

const LIVE_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  SubscriptionStatus.active,
  SubscriptionStatus.trial,
  SubscriptionStatus.pastDue,
]);

type PlanSubscription = {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  trialEndDate: Date | null;
};

export function getEntitlements(plan: PlanId): PlanEntitlements {
  return PLAN_CATALOG[plan].entitlements;
}

export function getEffectiveEntitlements(input: { appMode: AppMode; plan: SubscriptionPlan }): PlanEntitlements {
  if (input.appMode === "self-hosted") {
    return {
      ...PLAN_CATALOG.starter.entitlements,
      hostedAiUsageMultiplier: null,
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

export function isOnFreePlan(subscription: PlanSubscription, now: Date = new Date()): boolean {
  if (subscription.plan === SubscriptionPlan.enterprise || subscription.trialEndDate === null) return false;
  if (subscription.status === SubscriptionStatus.expired) return true;

  return subscription.status === SubscriptionStatus.trial && subscription.trialEndDate < now;
}

export function effectivePlanId(subscription: PlanSubscription, now: Date = new Date()): PlanId {
  return isOnFreePlan(subscription, now) ? FREE_PLAN_ID : subscription.plan;
}

export function routineAllowanceOf(subscription: PlanSubscription, now: Date = new Date()): number | "unlimited" {
  return getEntitlements(effectivePlanId(subscription, now)).includedRoutinesPerUser;
}

export function isSubscriptionLocked(subscription: PlanSubscription): boolean {
  return isSubscriptionExpired(subscription) && !isOnFreePlan(subscription);
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
