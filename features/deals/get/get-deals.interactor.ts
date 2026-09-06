import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type DealDto } from "../deal.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { DealDtoSchema } from "../deal.schema";
import { DEAL_GROUP_SUM_FIELDS } from "../deal-weighting";

export abstract class GetDealsRepo extends BaseGetRepo<DealDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.deals, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetDealsInteractor extends BaseGetInteractor<DealDto> {
  constructor(
    repo: GetDealsRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      EntityType.deal,
      { sortDescriptor: { field: "name", direction: "asc" } },
      queryParamsPrecheck,
      undefined,
      [DEAL_GROUP_SUM_FIELDS.total, DEAL_GROUP_SUM_FIELDS.weighted],
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(DealDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
