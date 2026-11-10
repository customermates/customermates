import { PLAN_CATALOG, PURCHASABLE_PLAN_IDS, type PurchasablePlanId } from "@/core/commercial/plan-catalog";

type Translate = (key: string, values?: Record<string, string | number>) => string;

export const MESSAGING_UPSELL_PLAN: PurchasablePlanId =
  PURCHASABLE_PLAN_IDS.find((plan) => PLAN_CATALOG[plan].entitlements.messaging) ?? "pro";

export function planUpsellHighlights(plan: PurchasablePlanId, t: Translate): string[] {
  const entitlements = PLAN_CATALOG[plan].entitlements;
  if (!entitlements.sharedAccounts) return [t("Upsell.pro.inbox"), t("Upsell.pro.drafts"), t("Upsell.pro.nextSteps")];

  const accounts = entitlements.includedAccountsPerUser;
  const multiplier = entitlements.hostedAiUsageMultiplier;

  return [
    ...(typeof accounts === "number" ? [t("Subscription.picker.connectedAccountsPerUser", { accounts })] : []),
    t("Upsell.business.sharedAccounts"),
    ...(typeof multiplier === "number" ? [t("Subscription.picker.hostedAiUsage", { multiplier })] : []),
  ];
}

export function freeUpgradeHighlights(plan: PurchasablePlanId, t: Translate): string[] {
  const { hostedAiUsageMultiplier: multiplier, includedRoutinesPerUser: routines } = PLAN_CATALOG[plan].entitlements;

  return [
    t("Upsell.starter.noLimits"),
    ...(typeof multiplier === "number" ? [t("Subscription.picker.hostedAiUsage", { multiplier })] : []),
    routines === "unlimited"
      ? t("Subscription.picker.unlimitedRoutinesPerUser")
      : t("Subscription.picker.routinesPerUser", { routines }),
  ];
}

function laterPlans(plan: string | null | undefined): PurchasablePlanId[] {
  const index = PURCHASABLE_PLAN_IDS.findIndex((candidate) => candidate === plan);
  return index < 0 ? [] : PURCHASABLE_PLAN_IDS.slice(index + 1);
}

export function nextMateUsagePlan(plan: string | null | undefined): PurchasablePlanId | null {
  const current = PURCHASABLE_PLAN_IDS.find((candidate) => candidate === plan);
  if (!current) return null;
  const multiplier = PLAN_CATALOG[current].entitlements.hostedAiUsageMultiplier;
  if (typeof multiplier !== "number") return null;
  return (
    laterPlans(current).find((candidate) => {
      const next = PLAN_CATALOG[candidate].entitlements.hostedAiUsageMultiplier;
      return typeof next === "number" && next > multiplier;
    }) ?? null
  );
}

export function nextRoutinePlan(plan: string | null | undefined): PurchasablePlanId | null {
  const current = PURCHASABLE_PLAN_IDS.find((candidate) => candidate === plan);
  if (!current) return null;
  const allowance = PLAN_CATALOG[current].entitlements.includedRoutinesPerUser;
  if (allowance === "unlimited") return null;
  return (
    laterPlans(current).find((candidate) => {
      const next = PLAN_CATALOG[candidate].entitlements.includedRoutinesPerUser;
      return next === "unlimited" || next > allowance;
    }) ?? null
  );
}

export function routineAllowanceLabel(plan: PurchasablePlanId, t: Translate): string {
  const routines = PLAN_CATALOG[plan].entitlements.includedRoutinesPerUser;
  return routines === "unlimited"
    ? t("Subscription.picker.unlimitedRoutinesPerUser")
    : t("Subscription.picker.routinesPerUser", { routines });
}
