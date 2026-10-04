import type { RecordRepo } from "@/features/records/record.repo";
import type { QueryRecordMeasureInteractor } from "@/features/records/query-record-measure.interactor";
import type { RecordWidgetDto, StoredRecordWidget } from "./record-widget.schema";
import { runInTransaction } from "@/core/decorators/transaction-runner";

export class RecordWidgetReader {
  constructor(
    private records: RecordRepo,
    private measures: QueryRecordMeasureInteractor,
  ) {}

  read(row: StoredRecordWidget): Promise<RecordWidgetDto> {
    return runInTransaction(
      async () => {
        const result = await this.measures.invoke(row.measure);
        if (!result.ok) return { ...row, status: "unavailable" as const, data: null, groupOptions: [] };
        const model = await this.records.getModel();
        const fieldId = result.data.groups.find((group) => group.fieldId)?.fieldId;
        const field = model.fields.find((candidate) => candidate.id === fieldId && !candidate.archived);
        return {
          ...row,
          status: "ready" as const,
          data: result.data,
          groupOptions: field?.options.map(({ id, label, color }) => ({ id, label, color })) ?? [],
        };
      },
      { readOnly: true, timeout: 30000 },
    );
  }
}
