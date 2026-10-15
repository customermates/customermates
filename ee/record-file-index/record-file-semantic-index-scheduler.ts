import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { RecordFileIndexScheduler } from "@/features/record-file-index/record-file-index-scheduler";
import type { WikiEmbeddingService } from "@/ee/wiki-retrieval/wiki-embedding.service";
import type { RecordFileSemanticIndexRepo } from "./record-file-semantic-index.repo";

import * as Sentry from "@sentry/node";

import { UserAccessor } from "@/core/base/user-accessor";

const RECORD_FILE_INDEX_SCHEDULE_INTERVAL_MS = 60_000;
const lastSchedule = new Map<string, number>();

export class RecordFileSemanticIndexScheduler extends UserAccessor implements RecordFileIndexScheduler {
  constructor(
    private repo: RecordFileSemanticIndexRepo,
    private embeddings: WikiEmbeddingService,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  async schedule(): Promise<void> {
    const now = Date.now();
    if (now - (lastSchedule.get(this.companyId) ?? 0) < RECORD_FILE_INDEX_SCHEDULE_INTERVAL_MS) return;
    try {
      if (!(await this.repo.semanticIndexAvailable())) return;
      if (!(await this.embeddings.authorizeIndexing(this.companyId, "fileIndexing"))) return;
      lastSchedule.set(this.companyId, now);
      await this.background.dispatch("index-record-files", { companyId: this.companyId });
    } catch (error) {
      Sentry.captureException(error);
    }
  }
}
