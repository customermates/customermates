import type { RecordMapWidgetReader } from "./record-map-widget-reader";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordMapWidgetInput, RecordMapWidgetDto } from "./record-map-widget.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordWidgetStoreRepo } from "./record-widget-store.repo";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { RecordMapWidgetInputSchema } from "./record-map-widget.schema";
import { upsertQueryWidget } from "./record-query-widget-upsert";
import { mapWidgetQueryIssue } from "./record-widget-query-validation";

@TenantInteractor()
export class UpsertRecordMapWidgetInteractor extends AuthenticatedInteractor<RecordMapWidgetInput, RecordMapWidgetDto> {
  constructor(
    private widgets: RecordWidgetStoreRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private reader: RecordMapWidgetReader,
    private views: DataViewStateRepo,
  ) {
    super();
  }

  @Validate(RecordMapWidgetInputSchema)
  async invoke(input: RecordMapWidgetInput): Validated<RecordMapWidgetDto> {
    const { widgets, records, policy, views, userId } = this;
    return runInTransaction(
      () =>
        upsertQueryWidget({ widgets, records, policy, views, userId }, "map", input, this.reader, mapWidgetQueryIssue),
      { timeout: 30000 },
    );
  }
}
