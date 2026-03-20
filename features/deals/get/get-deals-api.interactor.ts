import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type DealDto } from "../deal.schema";

import { GetDealsRepo } from "./get-deals.interactor";

import { ValidateQueryParamsValidator } from "@/core/base/validate-query-params.validator";
import { P13nRepo } from "@/core/base/base-get.interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsApiSchema } from "@/core/base/base-get.schema";

const GetDealsQueryParamsApiSchema = GetQueryParamsApiSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");
  await di.get(ValidateQueryParamsValidator).invoke(di.get(GetDealsRepo), EntityType.deal, data, ctx);
});

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.deals, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetDealsApiInteractor extends BaseGetInteractor<DealDto> {
  constructor(repo: GetDealsRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "name", direction: "asc" },
    });
  }

  @Validate(GetDealsQueryParamsApiSchema)
  async invoke(params: GetQueryParamsApi = {}): Validated<GetResult<DealDto>, GetQueryParamsApi> {
    return await super.invoke(params);
  }
}
