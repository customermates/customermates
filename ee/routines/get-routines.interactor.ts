import type { GetResult, P13nRepo } from "@/core/base/base-get.interactor";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { type RoutineDto, RoutineDtoSchema } from "./routine.schema";

import { BaseGetRepo, BaseGetInteractor } from "@/core/base/base-get.interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetRoutinesRepo extends BaseGetRepo<RoutineDto> {}

@AllowInDemoMode
@TenantInteractor()
export class GetRoutinesInteractor extends BaseGetInteractor<RoutineDto> {
  constructor(
    repo: GetRoutinesRepo,
    p13nRepo: P13nRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      p13nRepo,
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
