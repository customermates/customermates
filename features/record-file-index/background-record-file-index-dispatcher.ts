import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type {
  RecordFileIndexDispatcher,
  RecordFileIndexRequest,
} from "@/features/records/record-file-index-dispatcher";

import * as Sentry from "@sentry/nextjs";

export class BackgroundRecordFileIndexDispatcher implements RecordFileIndexDispatcher {
  constructor(private background: Pick<BackgroundTaskService, "dispatch">) {}

  async dispatch({ companyId, fileIds }: RecordFileIndexRequest): Promise<void> {
    if (fileIds.length === 0) return;
    try {
      await this.background.dispatch("index-record-files", { companyId });
    } catch (error) {
      Sentry.captureException(error, { tags: { kind: "record-file-index-dispatch", companyId } });
    }
  }
}
