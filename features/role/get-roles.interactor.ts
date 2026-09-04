import type { RoleWithAssignmentsDto as RoleDto } from "./role.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { RoleWithAssignmentsDtoSchema as RoleDtoSchema } from "./role.schema";
import { BaseGetRepo, BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";

export type { RoleWithAssignmentsDto as RoleDto } from "./role.schema";

export abstract class GetRolesRepo extends BaseGetRepo<RoleDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetRolesInteractor extends BaseGetInteractor<RoleDto> {
  constructor(
    repo: GetRolesRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      undefined,
      { sortDescriptor: { field: "type", direction: "asc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(RoleDtoSchema))
  async invoke(params: GetQueryParams = {}): Validated<GetResult<RoleDto>> {
    return await super.invoke(params);
  }
}
