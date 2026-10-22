import type { RecordWidgetStoreRepo } from "./record-widget-store.repo";
import type { RecordActivityWidgetReader } from "./record-activity-widget-reader";
import type { RecordCalendarWidgetReader } from "./record-calendar-widget-reader";
import type { RecordMapWidgetReader } from "./record-map-widget-reader";
import type { z } from "zod";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { GenericRecordWidgetDto } from "./record-widget.schema";
import type { RecordWidgetReader } from "./record-widget-reader";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWidgetReadSchema } from "./record-widget.schema";

@AllowInDemoMode
@TenantInteractor()
export class GetRecordWidgetInteractor extends AuthenticatedInteractor<
  z.infer<typeof RecordWidgetReadSchema>,
  GenericRecordWidgetDto
> {
  constructor(
    private widgets: RecordWidgetStoreRepo,
    private reader: RecordWidgetReader,
    private policy: RecordAccessPolicy,
    private activityReader: RecordActivityWidgetReader,
    private calendarReader: RecordCalendarWidgetReader,
    private mapReader: RecordMapWidgetReader,
  ) {
    super();
  }

  @Validate(RecordWidgetReadSchema)
  async invoke(input: z.infer<typeof RecordWidgetReadSchema>): Validated<GenericRecordWidgetDto> {
    return runInTransaction(
      async () => {
        if (!(await this.policy.load()).actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const stored = await this.widgets.findReadableWidget(input.id);
        if (!stored) return failNotFound(CustomErrorCode.widgetNotFound);
        if (input.window && stored.kind !== "calendar") return fail(CustomErrorCode.recordValueInvalid, ["window"]);
        switch (stored.kind) {
          case "calendar":
            return { ok: true as const, data: await this.calendarReader.read(stored.widget, input.window) };
          case "map":
            return { ok: true as const, data: await this.mapReader.read(stored.widget) };
          case "activityTimeline":
            return { ok: true as const, data: await this.activityReader.read(stored.widget) };
          case "chart":
            return { ok: true as const, data: await this.reader.read(stored.widget) };
        }
      },
      { readOnly: true, timeout: 30000 },
    );
  }
}
