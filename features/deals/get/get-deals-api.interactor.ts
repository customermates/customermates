import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { GetDealsRepo } from "./get-deals.interactor";
import type { P13nRepo } from "@/core/base/base-get.interactor";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type DealDto } from "../deal.schema";

import { getDealRepo, getValidateQueryParams } from "@/core/app-di";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsApiSchema, createGetResultSchema } from "@/core/base/base-get.schema";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { DealDtoSchema } from "../deal.schema";

const GetDealsQueryParamsApiSchema = GetQueryParamsApiSchema.superRefine(async (data, ctx) => {
  await getValidateQueryParams().invoke(getDealRepo(), EntityType.deal, data, ctx);
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
  @ValidateOutput(createGetResultSchema(DealDtoSchema))
  async invoke(params: GetQueryParamsApi = {}): Validated<GetResult<DealDto>> {
    return await super.invoke(params);
  }
}
