import type { RecordRepo } from "@/features/records/record.repo";
import type { GetRecordActivitiesInteractor } from "@/ee/messaging/activities/get-record-activities.interactor";
import type { RecordActivityWidgetDto, StoredRecordActivityWidget } from "./record-activity-widget.schema";
import { runInTransaction } from "@/core/decorators/transaction-runner";

export class RecordActivityWidgetReader {
  constructor(
    private records: RecordRepo,
    private activities: GetRecordActivitiesInteractor,
  ) {}

  read(row: StoredRecordActivityWidget): Promise<RecordActivityWidgetDto> {
    return runInTransaction(
      async () => {
        const result = await this.activities.invoke({ ...row.activityQuery, cursor: null, limit: 25 });
        const state = await this.records.getState();
        return {
          ...row,
          schemaRevision: state?.revision ?? 0,
          data: result.ok ? result.data : null,
          status: result.ok ? "ready" : "unavailable",
        };
      },
      { readOnly: true, timeout: 30000 },
    );
  }
}
