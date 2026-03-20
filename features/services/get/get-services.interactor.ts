import { Resource, Action } from "@/generated/prisma";

import { type ServiceDto } from "../service.schema";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo, P13nRepo } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";

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
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
