import type { z } from "zod";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { RecordMapWidgetReader } from "./record-map-widget-reader";
import type { MapWidgetData, RecordMapWidgetDto } from "./record-map-widget.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { PreviewRecordMapWidgetSchema } from "./record-widget-preview.schema";

export type MapWidgetPreview = { data: MapWidgetData; fields: RecordMapWidgetDto["fields"] };

@AllowInDemoMode
@TenantInteractor()
export class PreviewRecordMapWidgetInteractor extends AuthenticatedInteractor<
  z.infer<typeof PreviewRecordMapWidgetSchema>,
  MapWidgetPreview
> {
  constructor(
    private reader: RecordMapWidgetReader,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(PreviewRecordMapWidgetSchema)
  async invoke(input: z.infer<typeof PreviewRecordMapWidgetSchema>): Validated<MapWidgetPreview> {
    const policy = await this.policy.load();
    if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
    if (!policy.canReadType(input.mapQuery.source.typeId))
      return failNotFound(CustomErrorCode.recordTypeNotFound, ["mapQuery", "source", "typeId"]);
    return this.reader.preview(input.mapQuery);
  }
}
