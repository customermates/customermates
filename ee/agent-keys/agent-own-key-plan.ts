import type { PlanId } from "@/core/commercial/plan-catalog";

import { PLAN_CATALOG } from "@/core/commercial/plan-catalog";

type PlanSource = { plan(companyId?: string): Promise<{ plan: PlanId | null }> };

export class AgentOwnKeyPlan {
  constructor(private readonly plans: PlanSource) {}

  async allowed(companyId?: string): Promise<boolean> {
    const { plan } = await this.plans.plan(companyId);
    return plan === null || PLAN_CATALOG[plan].entitlements.agentOwnKey;
  }
}
