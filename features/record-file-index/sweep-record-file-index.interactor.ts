import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { RecordFileIndexRepo } from "./record-file-index.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const RECORD_FILE_INDEX_STALL_MS = 10 * 60_000;
const RECORD_FILE_INDEX_SWEEP_WORKSPACES = 50;

@SystemInteractor
export class SweepRecordFileIndexInteractor {
  constructor(
    private files: RecordFileIndexRepo,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  async invoke(): Promise<{ fileIndexWorkspaces: number }> {
    const companies = await this.files.companiesWithStalledFilesUnscoped(
      new Date(Date.now() - RECORD_FILE_INDEX_STALL_MS),
      RECORD_FILE_INDEX_SWEEP_WORKSPACES,
    );
    const results = await Promise.allSettled(
      companies.map((companyId) => this.background.dispatch("index-record-files", { companyId })),
    );
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Some file indexing could not be started; the next sweep will retry it");
    return { fileIndexWorkspaces: companies.length };
  }
}
