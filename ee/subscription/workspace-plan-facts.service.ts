import type { AppMode } from "@/core/config/environment";
import type { RouteGuardCompanyRepo } from "@/features/auth/route-guard-company.repo";
import type { PlanLimitsService } from "./plan-limits.service";

import { choosePlanUrl, workspacePlanFacts, type WorkspacePlanFacts } from "@/core/commercial/workspace-plan-facts";

import { effectivePlanId, isOnFreePlan } from "./entitlements";

export class WorkspacePlanFactsService {
  constructor(
    private readonly companies: Pick<RouteGuardCompanyRepo, "getSubscriptionOrThrowUnscoped">,
    private readonly limits: Pick<PlanLimitsService, "fit">,
    private readonly appMode: AppMode,
    private readonly baseUrl: string,
  ) {}

  async factsFor(workspace: { companyId: string; slug: string }): Promise<WorkspacePlanFacts | null> {
    if (this.appMode !== "cloud") return null;

    const [subscription, fit] = await Promise.all([
      this.companies.getSubscriptionOrThrowUnscoped(workspace.companyId),
      this.limits.fit(workspace.companyId),
    ]);
    return workspacePlanFacts({
      plan: effectivePlanId(subscription),
      status: subscription.status,
      trialEndDate: subscription.trialEndDate,
      onFreePlan: isOnFreePlan(subscription),
      fit,
      choosePlanUrl: choosePlanUrl(this.baseUrl, workspace.slug),
    });
  }
}
