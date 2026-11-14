import type { PlanId } from "@/core/commercial/plan-catalog";
import type { PurchasablePlanId } from "@/core/commercial/plan-catalog";
import type { AutomationPlanAllowance, AutomationPlanLimits } from "./automation-ports";

import { activeAutomationRuleLimit } from "@/core/commercial/automation-rule-limits";

type PlanSource = { plan(): Promise<{ plan: PlanId | null }> };
type UpgradePrice = (plan: PurchasablePlanId) => Promise<{ price: string }>;

export class AutomationPlanLimitsAdapter implements AutomationPlanLimits {
  constructor(
    private readonly plans: PlanSource,
    private readonly upgradePrice: UpgradePrice,
  ) {}

  async activeRuleAllowance(): Promise<AutomationPlanAllowance> {
    const { plan } = await this.plans.plan();
    const limit = plan === null ? null : activeAutomationRuleLimit(plan);
    if (limit === null) return { limit: null, price: "" };
    const next: PurchasablePlanId = plan === "free" ? "starter" : "pro";
    return { limit, price: (await this.upgradePrice(next)).price };
  }
}
