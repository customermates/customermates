import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { ReconcileBillingUsageRepo } from "./reconcile-billing-usage.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const BILLING_USAGE_WORKSPACE_PAGE = 200;
const BILLING_USAGE_DISPATCH_BATCH = 20;

@SystemInteractor
export class ReconcileBillingUsageInteractor {
  constructor(
    private repo: ReconcileBillingUsageRepo,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async invoke(): Promise<{ dispatched: number }> {
    let dispatched = 0;
    let after: string | null = null;
    for (;;) {
      const companies = await this.repo.findWorkspacesToReconcileUnscoped(after, BILLING_USAGE_WORKSPACE_PAGE);
      for (let start = 0; start < companies.length; start += BILLING_USAGE_DISPATCH_BATCH) {
        const batch = companies.slice(start, start + BILLING_USAGE_DISPATCH_BATCH);
        await Promise.all(batch.map((companyId) => this.background.dispatch("reconcile-billing-usage", { companyId })));
        dispatched += batch.length;
      }
      if (companies.length < BILLING_USAGE_WORKSPACE_PAGE) return { dispatched };
      after = companies.at(-1) ?? null;
    }
  }
}
