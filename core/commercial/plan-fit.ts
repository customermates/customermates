import type { PlanId, PlanEntitlements, PurchasablePlanId } from "./plan-catalog";

import { PLAN_CATALOG, PURCHASABLE_PLAN_IDS } from "./plan-catalog";

export const TRIAL_END_WINDOW_DAYS = 4;

export type PlanFitUsage = {
  members: number;
  connectedAccounts: number;
  maxAccountsPerUser: number;
  sharedAccounts: number;
  openDrafts: number;
  activeRoutines: number;
  maxRoutinesPerOwner: number;
  webhooks: number;
  mateRequests: number;
  apiClients: number;
};

export const EMPTY_PLAN_FIT_USAGE: PlanFitUsage = {
  members: 0,
  connectedAccounts: 0,
  maxAccountsPerUser: 0,
  sharedAccounts: 0,
  openDrafts: 0,
  activeRoutines: 0,
  maxRoutinesPerOwner: 0,
  webhooks: 0,
  mateRequests: 0,
  apiClients: 0,
};

export type FreeLossKind = "accounts" | "drafts" | "routines" | "members" | "webhooks" | "mate";

export type FreeLoss = { kind: FreeLossKind; count: number };

function holds(allowance: PlanEntitlements["includedAccountsPerUser"], needed: number): boolean {
  return allowance === "unlimited" || allowance >= needed;
}

function teamSharesAccounts(usage: PlanFitUsage): boolean {
  return usage.members > 1 && usage.sharedAccounts > 0;
}

export function lostOnFree(usage: PlanFitUsage): FreeLoss[] {
  const losses: FreeLoss[] = [
    { kind: "accounts", count: usage.connectedAccounts },
    { kind: "drafts", count: usage.openDrafts },
    { kind: "routines", count: usage.activeRoutines },
    { kind: "members", count: Math.max(0, usage.members - 1) },
    { kind: "webhooks", count: usage.webhooks },
    { kind: "mate", count: usage.mateRequests },
  ];
  return losses.filter((loss) => loss.count > 0);
}

export function planCovers(plan: PurchasablePlanId, usage: PlanFitUsage): boolean {
  const entitlements = PLAN_CATALOG[plan].entitlements;
  if (usage.mateRequests > 0 && !entitlements.agentChat) return false;
  if (usage.webhooks > 0 && !entitlements.webhooks) return false;
  if ((usage.connectedAccounts > 0 || usage.openDrafts > 0) && !entitlements.messaging) return false;
  if (usage.connectedAccounts > 0 && !holds(entitlements.includedAccountsPerUser, usage.maxAccountsPerUser))
    return false;
  if (teamSharesAccounts(usage) && !entitlements.sharedAccounts) return false;
  if (usage.activeRoutines > 0 && !holds(entitlements.includedRoutinesPerUser, usage.maxRoutinesPerOwner)) return false;
  return true;
}

function cheapestCoveringPlan(usage: PlanFitUsage): PurchasablePlanId {
  return (
    PURCHASABLE_PLAN_IDS.find((plan) => planCovers(plan, usage)) ??
    PURCHASABLE_PLAN_IDS[PURCHASABLE_PLAN_IDS.length - 1]
  );
}

export function planThatKeepsItRunning(usage: PlanFitUsage): PurchasablePlanId | null {
  return lostOnFree(usage).length > 0 ? cheapestCoveringPlan(usage) : null;
}

export function recommendedPlan(usage: PlanFitUsage | null): PurchasablePlanId | null {
  if (!usage) return null;
  if (lostOnFree(usage).length > 0 || teamSharesAccounts(usage)) return cheapestCoveringPlan(usage);
  return usage.apiClients > 0 ? PURCHASABLE_PLAN_IDS[0] : null;
}

export function nextStoragePlan(plan: PlanId | null | undefined): PurchasablePlanId | null {
  if (!plan) return null;
  const current = PLAN_CATALOG[plan].entitlements.fileStorageBytesPerActiveUser;
  if (current === "contract") return null;
  return (
    PURCHASABLE_PLAN_IDS.find((candidate) => {
      const next = PLAN_CATALOG[candidate].entitlements.fileStorageBytesPerActiveUser;
      return typeof next === "number" && (current === null || next > current);
    }) ?? null
  );
}
