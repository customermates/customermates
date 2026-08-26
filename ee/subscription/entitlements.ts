import type { PlanEntitlements } from "@/core/commercial/plan-catalog";
import type { SubscriptionPlan } from "@/generated/prisma";
import type { AppMode } from "@/core/config/environment";

import { SubscriptionStatus } from "@/generated/prisma";
import { PLAN_CATALOG } from "@/core/commercial/plan-catalog";

export type { PlanEntitlements } from "@/core/commercial/plan-catalog";

export type EntitlementFeature = "agentChat" | "messaging" | "sharedAccounts";

export const TRIAL_HOSTED_AI_CREDITS_PER_ACTIVE_USER = 500;

export function lowestPlanHostedAiCreditsPerActiveUser(): number {
  const allowances = Object.values(PLAN_CATALOG)
    .map((plan) => plan.entitlements.hostedAiCreditsPerActiveUser)
    .flatMap((allowance) => (typeof allowance === "number" && allowance > 0 ? [allowance] : []));
  if (allowances.length === 0) throw new Error("No plan defines a hosted AI credit allowance.");

  return Math.min(...allowances);
}

export function getEntitlements(plan: SubscriptionPlan): PlanEntitlements {
  return PLAN_CATALOG[plan].entitlements;
}

export function getEffectiveEntitlements(input: { appMode: AppMode; plan: SubscriptionPlan }): PlanEntitlements {
  if (input.appMode === "self-hosted")
    return { ...PLAN_CATALOG.starter.entitlements, hostedAiCreditsPerActiveUser: null };

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
