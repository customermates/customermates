import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { ReconcileBillingUsageRepo } from "./reconcile-billing-usage.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const BILLING_USAGE_WORKSPACE_PAGE = 200;

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
      const companies = await this.repo.findRecordedWorkspacesUnscoped(after, BILLING_USAGE_WORKSPACE_PAGE);
      for (const companyId of companies) {
        await this.background.dispatch("reconcile-billing-usage", { companyId });
        dispatched += 1;
      }
      if (companies.length < BILLING_USAGE_WORKSPACE_PAGE) return { dispatched };
      after = companies.at(-1) ?? null;
    }
  }
}
