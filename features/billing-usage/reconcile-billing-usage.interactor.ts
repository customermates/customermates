import type { ReconcileBillingUsageRepo } from "./reconcile-billing-usage.repo";

import * as Sentry from "@sentry/nextjs";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

@SystemInteractor
export class ReconcileBillingUsageInteractor {
  constructor(private readonly repo: ReconcileBillingUsageRepo) {}

  async invoke(): Promise<{ workspaces: number; closed: number; failed: number }> {
    let failed = 0;
    const attempt = async (companyId: string, run: () => Promise<unknown>) => {
      try {
        return (await run()) !== false;
      } catch (error) {
        failed += 1;
        Sentry.captureException(error, { tags: { kind: "billing-usage-reconcile" }, extra: { companyId } });
        return false;
      }
    };

    const companyIds = await this.repo.listCompanyIdsUnscoped();
    for (const companyId of companyIds) await attempt(companyId, () => this.repo.reconcileCompanyUnscoped(companyId));

    const missing = await this.repo.listRecordedWorkspacesWithoutCompanyUnscoped();
    let closed = 0;
    for (const companyId of missing)
      if (await attempt(companyId, () => this.repo.closeMissingWorkspaceUnscoped(companyId))) closed += 1;

    return { workspaces: companyIds.length, closed, failed };
  }
}
