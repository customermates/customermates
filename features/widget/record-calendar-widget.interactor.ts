import type { RecordCalendarWidgetReader } from "./record-calendar-widget-reader";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordCalendarWidgetInput, RecordCalendarWidgetDto } from "./record-calendar-widget.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordWidgetStoreRepo } from "./record-widget-store.repo";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { RecordCalendarWidgetInputSchema } from "./record-calendar-widget.schema";
import { upsertQueryWidget } from "./record-query-widget-upsert";
import { calendarWidgetQueryIssue } from "./record-widget-query-validation";

@TenantInteractor()
export class UpsertRecordCalendarWidgetInteractor extends AuthenticatedInteractor<
  RecordCalendarWidgetInput,
  RecordCalendarWidgetDto
> {
  constructor(
    private widgets: RecordWidgetStoreRepo,
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private reader: RecordCalendarWidgetReader,
    private views: DataViewStateRepo,
  ) {
    super();
  }

  @Validate(RecordCalendarWidgetInputSchema)
  async invoke(input: RecordCalendarWidgetInput): Validated<RecordCalendarWidgetDto> {
    const { widgets, records, policy, views, userId } = this;
    return runInTransaction(
      () =>
        upsertQueryWidget(
          { widgets, records, policy, views, userId },
          "calendar",
          input,
          this.reader,
          calendarWidgetQueryIssue,
        ),
      { timeout: 30000 },
    );
  }
}
