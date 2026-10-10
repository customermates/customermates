import type { RecordActivityWidgetRepo } from "./record-activity-widget.schema";
import type { RecordActivityWidgetReader } from "./record-activity-widget-reader";
import type { z } from "zod";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordWidgetRepo, GenericRecordWidgetDto } from "./record-widget.schema";
import type { RecordWidgetReader } from "./record-widget-reader";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWidgetReadSchema } from "./get-record-widgets.interactor";

@AllowInDemoMode
@TenantInteractor()
export class GetRecordWidgetInteractor extends AuthenticatedInteractor<
  z.infer<typeof RecordWidgetReadSchema>,
  GenericRecordWidgetDto
> {
  constructor(
    private widgets: RecordWidgetRepo,
    private reader: RecordWidgetReader,
    private policy: RecordAccessPolicy,
    private activityWidgets: RecordActivityWidgetRepo,
    private activityReader: RecordActivityWidgetReader,
  ) {
    super();
  }

  @Validate(RecordWidgetReadSchema)
  async invoke(input: z.infer<typeof RecordWidgetReadSchema>): Validated<GenericRecordWidgetDto> {
    return runInTransaction(
      async () => {
        if (!(await this.policy.load()).actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const row = await this.widgets.findReadable(input.id);
        if (row) return { ok: true as const, data: await this.reader.read(row) };
        const activity = await this.activityWidgets.findReadable(input.id);
        if (!activity) return failNotFound(CustomErrorCode.widgetNotFound);
        return { ok: true as const, data: await this.activityReader.read(activity) };
      },
      { readOnly: true, timeout: 30000 },
    );
  }
}
