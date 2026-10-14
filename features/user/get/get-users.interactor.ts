import type { GetUsersRepo } from "./get-users.repo";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource } from "@/generated/prisma";

import { type UserDto } from "../user.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { UserDtoSchema } from "../user.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.users, read: true })
export class GetUsersInteractor extends BaseGetInteractor<UserDto> {
  constructor(
    repo: GetUsersRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(repo, viewStateRepo, mode, { sortDescriptor: { field: "name", direction: "asc" } }, queryParamsPrecheck);
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(UserDtoSchema))
  async invoke(params: GetQueryParams = {}): Validated<GetResult<UserDto>> {
    return await super.invoke(params);
  }
}
