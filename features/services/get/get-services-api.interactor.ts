import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type ServiceDto } from "../service.schema";

import { GetServicesRepo } from "./get-services.interactor";

import { ValidateQueryParamsValidator } from "@/core/base/validate-query-params.validator";
import { P13nRepo } from "@/core/base/base-get.interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsApiSchema } from "@/core/base/base-get.schema";

const GetServicesQueryParamsApiSchema = GetQueryParamsApiSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");
  await di.get(ValidateQueryParamsValidator).invoke(di.get(GetServicesRepo), EntityType.service, data, ctx);
});

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.services, action: Action.readAll },
    { resource: Resource.services, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetServicesApiInteractor extends BaseGetInteractor<ServiceDto> {
  constructor(repo: GetServicesRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "name", direction: "asc" },
    });
  }

  @Validate(GetServicesQueryParamsApiSchema)
  async invoke(params: GetQueryParamsApi = {}): Validated<GetResult<ServiceDto>, GetQueryParamsApi> {
    return await super.invoke(params);
  }
}
