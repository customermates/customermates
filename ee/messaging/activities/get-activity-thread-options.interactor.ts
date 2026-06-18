import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

import type { ActivityThreadOptionDto } from "./activities.schema";
import { ActivityThreadOptionDtoSchema } from "./activities.schema";

const Schema = z.object({
  entityType: z.enum(EntityType).optional(),
  entityId: z.uuid().optional(),
});
export type ActivityThreadOptionsData = Data<typeof Schema>;

export abstract class ActivityThreadOptionsRepo {
  abstract listThreadOptions(args: ActivityThreadOptionsData): Promise<ActivityThreadOptionDto[]>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetActivityThreadOptionsInteractor extends AuthenticatedInteractor<
  ActivityThreadOptionsData,
  ActivityThreadOptionDto[]
> {
  constructor(private repo: ActivityThreadOptionsRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(ActivityThreadOptionDtoSchema)
  async invoke(data: ActivityThreadOptionsData): Validated<ActivityThreadOptionDto[]> {
    const options = await this.repo.listThreadOptions(data);

    return { ok: true as const, data: options };
  }
}
