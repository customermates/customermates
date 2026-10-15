import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { RecordFileCleanupRepo } from "@/features/records/record-file-cleanup.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const RECORD_FILE_PURGE_COMPANY_PAGE = 200;

@SystemInteractor
export class PurgeExpiredRecordFilesInteractor {
  constructor(
    private repo: Pick<RecordFileCleanupRepo, "findFileCompaniesUnscoped">,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async invoke(args: { now?: Date } = {}): Promise<{ dispatched: string[] }> {
    const now = args.now ?? new Date();
    const dispatched: string[] = [];
    let after: string | null = null;
    for (;;) {
      const companies = await this.repo.findFileCompaniesUnscoped(after, RECORD_FILE_PURGE_COMPANY_PAGE);
      for (const companyId of companies) {
        await this.background.dispatch("purge-record-files", { companyId, now: now.toISOString() });
        dispatched.push(companyId);
      }
      if (companies.length < RECORD_FILE_PURGE_COMPANY_PAGE) return { dispatched };
      after = companies.at(-1) ?? null;
    }
  }
}
