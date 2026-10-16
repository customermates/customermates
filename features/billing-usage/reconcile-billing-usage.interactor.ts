import type { ReconcileBillingUsageRepo } from "./reconcile-billing-usage.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

@SystemInteractor
export class ReconcileBillingUsageInteractor {
  constructor(private readonly repo: ReconcileBillingUsageRepo) {}

  async invoke(): Promise<{ workspaces: number; closed: number }> {
    const companyIds = await this.repo.listCompanyIdsUnscoped();
    for (const companyId of companyIds) await this.repo.reconcileCompanyUnscoped(companyId);

    const missing = await this.repo.listRecordedWorkspacesWithoutCompanyUnscoped();
    for (const companyId of missing) await this.repo.closeMissingWorkspaceUnscoped(companyId);

    return { workspaces: companyIds.length, closed: missing.length };
  }
}
