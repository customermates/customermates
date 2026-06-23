import type { P13nRepo } from "@/core/base/base-get.interactor";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";

import type { EntityType } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";

import type { ActivityEntryDto, ActivitiesParams } from "./activities.schema";
import { ActivitiesParamsSchema, ActivitiesResultSchema } from "./activities.schema";

export abstract class GetActivitiesRepo extends BaseGetRepo<ActivityEntryDto> {
  abstract setScope(entityType?: EntityType, entityId?: string): void;
}

@AllowInDemoMode
@TenantInteractor()
export class GetActivitiesInteractor extends BaseGetInteractor<ActivityEntryDto> {
  constructor(
    private activitiesRepo: GetActivitiesRepo,
    p13nRepo: P13nRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      activitiesRepo,
      p13nRepo,
      mode,
      undefined,
      { sortDescriptor: { field: "at", direction: "desc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(ActivitiesParamsSchema)
  @ValidateOutput(ActivitiesResultSchema)
  async invoke(params: ActivitiesParams = {}) {
    this.activitiesRepo.setScope(params.entityType, params.entityId);

    return super.invoke(params);
  }
}
