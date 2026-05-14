import type { P13nRepo } from "@/core/base/base-get.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type UserDto } from "../user.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { UserDtoSchema } from "../user.schema";

export abstract class GetUsersRepo extends BaseGetRepo<UserDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetUsersInteractor extends BaseGetInteractor<UserDto> {
  constructor(repo: GetUsersRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "name", direction: "asc" },
    });
  }

  @Enforce(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(UserDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
