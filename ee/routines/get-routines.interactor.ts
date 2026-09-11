import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { Action, Resource } from "@/generated/prisma";

import { type RoutineDto, RoutineDtoSchema } from "./routine.schema";

import { BaseGetRepo, BaseGetInteractor } from "@/core/base/base-get.interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetRoutinesRepo extends BaseGetRepo<RoutineDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.routines, action: Action.readAll },
    { resource: Resource.routines, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetRoutinesInteractor extends BaseGetInteractor<RoutineDto> {
  constructor(
    repo: GetRoutinesRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      undefined,
      { sortDescriptor: { field: "createdAt", direction: "desc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(RoutineDtoSchema))
  async invoke(params: GetQueryParams = {}): Validated<GetResult<RoutineDto>> {
    return await super.invoke(params);
  }
}
