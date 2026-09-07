import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type OrganizationDto } from "../organization.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { OrganizationDtoSchema } from "../organization.schema";

export abstract class GetOrganizationsRepo extends BaseGetRepo<OrganizationDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetOrganizationsInteractor extends BaseGetInteractor<OrganizationDto> {
  constructor(
    repo: GetOrganizationsRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      EntityType.organization,
      { sortDescriptor: { field: "name", direction: "asc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(OrganizationDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
