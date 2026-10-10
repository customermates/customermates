import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export const TRASH_PURGE_COMPANY_LIMIT = 50;

export type ExpiredTrashRepo = {
  findExpiredTrashCompaniesUnscoped(
    now: Date,
    limit: number,
  ): Promise<Array<{ companyId: string; administratorId: string | null }>>;
};

@SystemInteractor
export class PurgeExpiredTrashInteractor {
  constructor(
    private repo: ExpiredTrashRepo,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async invoke(args: { now?: Date } = {}): Promise<{ dispatched: string[]; skipped: string[] }> {
    const now = args.now ?? new Date();
    const companies = await this.repo.findExpiredTrashCompaniesUnscoped(now, TRASH_PURGE_COMPANY_LIMIT);
    const dispatched: string[] = [];
    const skipped: string[] = [];
    for (const { companyId, administratorId } of companies) {
      if (!administratorId) {
        skipped.push(companyId);
        continue;
      }
      await this.background.dispatch("purge-trash", { companyId, administratorId, now: now.toISOString() });
      dispatched.push(companyId);
    }
    return { dispatched, skipped };
  }
}
