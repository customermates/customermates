import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { GetServicesRepo } from "./get-services.interactor";
import type { P13nRepo } from "@/core/base/base-get.interactor";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type ServiceDto } from "../service.schema";

import { getServiceRepo, getValidateQueryParams } from "@/core/di";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsApiSchema, createGetResultSchema } from "@/core/base/base-get.schema";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { ServiceDtoSchema } from "../service.schema";

const GetServicesQueryParamsApiSchema = GetQueryParamsApiSchema.superRefine(async (data, ctx) => {
  await getValidateQueryParams().invoke(getServiceRepo(), EntityType.service, data, ctx);
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
  @ValidateOutput(createGetResultSchema(ServiceDtoSchema))
  async invoke(params: GetQueryParamsApi = {}): Validated<GetResult<ServiceDto>> {
    return await super.invoke(params);
  }
}
