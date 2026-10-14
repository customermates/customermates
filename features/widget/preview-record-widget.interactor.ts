import type { RecordMeasure } from "@/features/records/record-measure.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordWidgetPreview, RecordWidgetReader } from "./record-widget-reader";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";

@AllowInDemoMode
@TenantInteractor()
export class PreviewRecordWidgetInteractor extends AuthenticatedInteractor<RecordMeasure, RecordWidgetPreview> {
  constructor(private reader: RecordWidgetReader) {
    super();
  }

  @Validate(RecordMeasureSchema)
  async invoke(measure: RecordMeasure): Validated<RecordWidgetPreview> {
    return this.reader.preview(measure);
  }
}
