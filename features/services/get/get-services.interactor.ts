import type { P13nRepo } from "@/core/base/base-get.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type ServiceDto } from "../service.schema";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { ServiceDtoSchema } from "../service.schema";

export abstract class GetServicesRepo extends BaseGetRepo<ServiceDto> {}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.services, action: Action.readAll },
    { resource: Resource.services, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetServicesInteractor extends BaseGetInteractor<ServiceDto> {
  constructor(repo: GetServicesRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "name", direction: "asc" },
    });
  }

  @Enforce(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(ServiceDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
