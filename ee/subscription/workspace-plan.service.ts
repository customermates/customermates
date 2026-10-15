import type { WorkspacePlanRepo } from "./workspace-plan.repo";

import { env } from "@/env";

import { isAwaitingFirstPlan, isSubscriptionExpired } from "./entitlements";

export class WorkspacePlanService {
  constructor(private readonly repo: WorkspacePlanRepo) {}

  async canUseIntegrations(companyId: string): Promise<boolean> {
    if (env.APP_MODE !== "cloud") return true;

    const plan = await this.repo.findWorkspacePlanUnscoped(companyId);
    return plan === null || !isAwaitingFirstPlan(plan);
  }

  async canCreateIntegrations(companyId: string): Promise<boolean> {
    if (env.APP_MODE !== "cloud") return true;

    const plan = await this.repo.findWorkspacePlanUnscoped(companyId);
    return plan !== null && !isSubscriptionExpired(plan);
  }
}
