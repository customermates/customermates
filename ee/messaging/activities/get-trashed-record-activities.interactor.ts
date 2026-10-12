import type { Validated } from "@/core/validation/validation.utils";
import type { GetRecordActivitiesInteractor } from "./get-record-activities.interactor";
import type { RecordActivitiesInput, RecordActivitiesResult } from "./record-activities.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { RecordActivitiesInputSchema } from "./record-activities.schema";

@AllowInDemoMode
@TenantInteractor()
export class GetTrashedRecordActivitiesInteractor extends AuthenticatedInteractor<
  RecordActivitiesInput,
  RecordActivitiesResult
> {
  constructor(private activities: GetRecordActivitiesInteractor) {
    super();
  }

  @Validate(RecordActivitiesInputSchema)
  async invoke(input: RecordActivitiesInput): Validated<RecordActivitiesResult> {
    return this.activities.read(input, { includeTrashed: true });
  }
}
