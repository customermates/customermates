import type { SubscriptionStatus } from "@/generated/prisma";
import type { PlanId, PurchasablePlanId } from "./plan-catalog";
import type { FreeLoss, PlanFitUsage } from "./plan-fit";

import { billingHref } from "@/app/components/navigation/settings-routes";
import { absoluteWorkspaceUrl } from "@/core/navigation/workspace-paths";

import { lostOnFree, planThatKeepsItRunning, trialDaysLeft } from "./plan-fit";

export type WorkspacePlanFacts = {
  plan: PlanId;
  onFreePlan: boolean;
  trialDaysLeft: number | null;
  lostOnFree: FreeLoss[];
  keepsItRunning: PurchasablePlanId | null;
  choosePlanUrl: string;
};

export function choosePlanUrl(baseUrl: string, slug: string): string {
  return absoluteWorkspaceUrl(baseUrl, null, slug, billingHref());
}

export function workspacePlanFacts(input: {
  plan: PlanId;
  status: SubscriptionStatus;
  trialEndDate: Date | null;
  onFreePlan: boolean;
  fit: PlanFitUsage;
  choosePlanUrl: string;
  now?: number;
}): WorkspacePlanFacts {
  const trialing = input.status === "trial" && !input.onFreePlan;
  const unpaid = trialing || input.onFreePlan;
  return {
    plan: input.plan,
    onFreePlan: input.onFreePlan,
    trialDaysLeft: trialing ? trialDaysLeft(input.trialEndDate, input.now) : null,
    lostOnFree: unpaid ? lostOnFree(input.fit) : [],
    keepsItRunning: unpaid ? planThatKeepsItRunning(input.fit) : null,
    choosePlanUrl: input.choosePlanUrl,
  };
}
