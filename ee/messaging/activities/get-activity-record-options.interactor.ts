import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ActivityRecordRefDto } from "./activities.schema";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { ActivityRecordRefSchema } from "./activities.schema";
import { ActivityScopeRecordGroupsSchema } from "./activity-scope.schema";

const Schema = z.object({
  records: ActivityScopeRecordGroupsSchema.min(1),
});

export type ActivityRecordOptionsData = Data<typeof Schema>;

export abstract class ActivityRecordOptionsRepo {
  abstract listRecordOptions(data: ActivityRecordOptionsData): Promise<ActivityRecordRefDto[]>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetActivityRecordOptionsInteractor extends AuthenticatedInteractor<
  ActivityRecordOptionsData,
  ActivityRecordRefDto[]
> {
  constructor(private repo: ActivityRecordOptionsRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(ActivityRecordRefSchema)
  async invoke(data: ActivityRecordOptionsData): Validated<ActivityRecordRefDto[]> {
    return { ok: true as const, data: await this.repo.listRecordOptions(data) };
  }
}
