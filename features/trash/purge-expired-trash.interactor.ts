import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { ExpiredTrashRepo } from "./expired-trash.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const TRASH_PURGE_COMPANY_PAGE = 200;

@SystemInteractor
export class PurgeExpiredTrashInteractor {
  constructor(
    private repo: ExpiredTrashRepo,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async invoke(args: { now?: Date } = {}): Promise<{ dispatched: string[] }> {
    const now = args.now ?? new Date();
    const dispatched: string[] = [];
    let after: string | null = null;
    for (;;) {
      const companies = await this.repo.findExpiredTrashCompaniesUnscoped(now, after, TRASH_PURGE_COMPANY_PAGE);
      for (const companyId of companies) {
        await this.background.dispatch("purge-trash", { companyId, now: now.toISOString() });
        dispatched.push(companyId);
      }
      if (companies.length < TRASH_PURGE_COMPANY_PAGE) return { dispatched };
      after = companies.at(-1) ?? null;
    }
  }
}
