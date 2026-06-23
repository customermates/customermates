import type { UserRoleDto } from "./role.types";
import type { GetResult, P13nRepo } from "@/core/base/base-get.interactor";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { RoleDtoSchema } from "./role.schema";
import { BaseGetRepo, BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";

export type { UserRoleDto } from "./role.types";

export abstract class GetRolesRepo extends BaseGetRepo<UserRoleDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetRolesInteractor extends BaseGetInteractor<UserRoleDto> {
  constructor(
    repo: GetRolesRepo,
    p13nRepo: P13nRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      p13nRepo,
      mode,
      undefined,
      { sortDescriptor: { field: "type", direction: "asc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(RoleDtoSchema))
  async invoke(params: GetQueryParams = {}): Validated<GetResult<UserRoleDto>> {
    return await super.invoke(params);
  }
}
