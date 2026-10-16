import type { z } from "zod";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordCalendarWidgetReader } from "./record-calendar-widget-reader";
import type { CalendarWidgetData, RecordCalendarWidgetDto } from "./record-calendar-widget.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { PreviewRecordCalendarWidgetSchema } from "./record-widget-preview.schema";

export type CalendarWidgetPreview = { data: CalendarWidgetData; fields: RecordCalendarWidgetDto["fields"] };

@AllowInDemoMode
@TenantInteractor()
export class PreviewRecordCalendarWidgetInteractor extends AuthenticatedInteractor<
  z.infer<typeof PreviewRecordCalendarWidgetSchema>,
  CalendarWidgetPreview
> {
  constructor(
    private reader: RecordCalendarWidgetReader,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(PreviewRecordCalendarWidgetSchema)
  async invoke(input: z.infer<typeof PreviewRecordCalendarWidgetSchema>): Validated<CalendarWidgetPreview> {
    const policy = await this.policy.load();
    if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
    if (!policy.canReadType(input.calendarQuery.source.typeId))
      return failNotFound(CustomErrorCode.recordTypeNotFound, ["calendarQuery", "source", "typeId"]);
    return this.reader.preview(input.calendarQuery, input.window);
  }
}
