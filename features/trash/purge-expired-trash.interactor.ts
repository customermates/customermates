import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export const TRASH_PURGE_COMPANY_PAGE = 200;

export type ExpiredTrashRepo = {
  findExpiredTrashCompaniesUnscoped(
    now: Date,
    after: string | null,
    limit: number,
  ): Promise<Array<{ companyId: string; actorUserId: string | null }>>;
};

/**
 * Daily retention: walks every company with expired Trash items, page by page, and starts one purge per company. The
 * purge acts as the company's system-role user (an active one when there is one) and records its changes as the
 * system, so companies without an active administrator are purged too.
 */
@SystemInteractor
export class PurgeExpiredTrashInteractor {
  constructor(
    private repo: ExpiredTrashRepo,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async invoke(args: { now?: Date } = {}): Promise<{ dispatched: string[]; skipped: string[] }> {
    const now = args.now ?? new Date();
    const dispatched: string[] = [];
    const skipped: string[] = [];
    let after: string | null = null;
    for (;;) {
      const companies = await this.repo.findExpiredTrashCompaniesUnscoped(now, after, TRASH_PURGE_COMPANY_PAGE);
      for (const { companyId, actorUserId } of companies) {
        if (!actorUserId) {
          skipped.push(companyId);
          continue;
        }
        await this.background.dispatch("purge-trash", { companyId, actorUserId, now: now.toISOString() });
        dispatched.push(companyId);
      }
      if (companies.length < TRASH_PURGE_COMPANY_PAGE) return { dispatched, skipped };
      after = companies.at(-1)?.companyId ?? null;
    }
  }
}
