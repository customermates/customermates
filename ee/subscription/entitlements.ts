import type { PlanEntitlements } from "@/core/commercial/plan-catalog";
import type { SubscriptionPlan } from "@/generated/prisma";
import type { AppMode } from "@/core/config/environment";

import { SubscriptionStatus } from "@/generated/prisma";
import { PLAN_CATALOG, SELF_HOSTED_BASELINE_PLAN } from "@/core/commercial/plan-catalog";

export type { PlanEntitlements } from "@/core/commercial/plan-catalog";

export type EntitlementFeature = "messaging" | "sharedAccounts";

export function getEntitlements(plan: SubscriptionPlan): PlanEntitlements {
  return PLAN_CATALOG[plan].entitlements;
}

export function getEffectiveEntitlements(input: { appMode: AppMode; plan: SubscriptionPlan }): PlanEntitlements {
  if (input.appMode === "self-hosted") return PLAN_CATALOG[SELF_HOSTED_BASELINE_PLAN].entitlements;

  return getEntitlements(input.plan);
}

type SubscriptionAccessInput = {
  status: SubscriptionStatus;
  trialEndDate: Date | null;
  currentPeriodEnd?: Date | null;
};

export type SubscriptionAccessState = "usable" | "blocked";

export function getSubscriptionAccessState(
  subscription: SubscriptionAccessInput,
  now: Date = new Date(),
): SubscriptionAccessState {
  if (subscription.status === SubscriptionStatus.active) return "usable";
  if (subscription.status === SubscriptionStatus.trial)
    return subscription.trialEndDate !== null && subscription.trialEndDate > now ? "usable" : "blocked";

  if (subscription.status === SubscriptionStatus.cancelled) {
    return subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd !== undefined &&
      subscription.currentPeriodEnd > now
      ? "usable"
      : "blocked";
  }
  return "blocked";
}

export function isSubscriptionExpired(subscription: SubscriptionAccessInput, now: Date = new Date()): boolean {
  return getSubscriptionAccessState(subscription, now) === "blocked";
}

export function isSubscriptionUsable(subscription: SubscriptionAccessInput, now: Date = new Date()): boolean {
  return getSubscriptionAccessState(subscription, now) === "usable";
}
