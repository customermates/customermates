import type { UserRoleDto } from "./role.types";
import type { P13nRepo } from "@/core/base/base-get.interactor";

import { Resource, Action } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { RoleDtoSchema } from "./role.schema";
import { BaseGetRepo, BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";

export type { UserRoleDto } from "./role.types";

export abstract class GetRolesRepo extends BaseGetRepo<UserRoleDto> {}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetRolesInteractor extends BaseGetInteractor<UserRoleDto> {
  constructor(repo: GetRolesRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "type", direction: "asc" },
    });
  }

  @Enforce(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(RoleDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
