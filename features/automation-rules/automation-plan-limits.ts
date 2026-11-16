import type { PlanId } from "@/core/commercial/plan-catalog";
import type { PurchasablePlanId } from "@/core/commercial/plan-catalog";
import type { AutomationPlanAllowance, AutomationPlanLimits } from "./automation-ports";

import { PLAN_CATALOG } from "@/core/commercial/plan-catalog";

type PlanSource = { plan(): Promise<{ plan: PlanId | null }> };
type UpgradePrice = (plan: PurchasablePlanId) => Promise<{ price: string }>;

export class AutomationPlanLimitsAdapter implements AutomationPlanLimits {
  constructor(
    private readonly plans: PlanSource,
    private readonly upgradePrice: UpgradePrice,
  ) {}

  async activeRuleAllowance(): Promise<AutomationPlanAllowance> {
    const { plan } = await this.plans.plan();
    const limit = plan === null ? "unlimited" : PLAN_CATALOG[plan].entitlements.activeAutomationRules;
    if (limit === "unlimited") return { limit: null, price: "" };
    const next: PurchasablePlanId = plan === "free" ? "starter" : "pro";
    return { limit, price: (await this.upgradePrice(next)).price };
  }
}
