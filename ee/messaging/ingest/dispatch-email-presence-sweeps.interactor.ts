import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { DispatchEmailPresenceSweepsRepo } from "./dispatch-email-presence-sweeps.repo";

import * as ErrorReporter from "@/core/observability/server";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

@SystemInteractor
export class DispatchEmailPresenceSweepsInteractor {
  constructor(
    private repo: DispatchEmailPresenceSweepsRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {}

  async invoke(): Promise<{ dispatched: number; failed: number }> {
    const accounts = await this.repo.findAccountsForEmailPresenceSweepUnscoped();
    let dispatched = 0;
    let failed = 0;

    for (const account of accounts) {
      try {
        await this.backgroundTaskService.dispatch("sweep-email-presence", { connectedAccountId: account.id });
        dispatched += 1;
      } catch (error) {
        failed += 1;
        ErrorReporter.captureException(error, {
          tags: { connectedAccountId: account.id, companyId: account.companyId },
        });
      }
    }

    return { dispatched, failed };
  }
}
