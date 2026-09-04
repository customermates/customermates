import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { type UserDto } from "../user.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
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
  constructor(
    repo: GetUsersRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      undefined,
      { sortDescriptor: { field: "name", direction: "asc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(UserDtoSchema))
  async invoke(params: GetQueryParams = {}): Validated<GetResult<UserDto>> {
    return await super.invoke(params);
  }
}
