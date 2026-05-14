import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { GetOrganizationsRepo } from "./get-organizations.interactor";
import type { P13nRepo } from "@/core/base/base-get.interactor";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type OrganizationDto } from "../organization.schema";

import { getOrganizationRepo, getValidateQueryParams } from "@/core/app-di";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsApiSchema, createGetResultSchema } from "@/core/base/base-get.schema";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { OrganizationDtoSchema } from "../organization.schema";

const GetOrganizationsQueryParamsApiSchema = GetQueryParamsApiSchema.superRefine(async (data, ctx) => {
  await getValidateQueryParams().invoke(getOrganizationRepo(), EntityType.organization, data, ctx);
});

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetOrganizationsApiInteractor extends BaseGetInteractor<OrganizationDto> {
  constructor(repo: GetOrganizationsRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "name", direction: "asc" },
    });
  }

  @Validate(GetOrganizationsQueryParamsApiSchema)
  @ValidateOutput(createGetResultSchema(OrganizationDtoSchema))
  async invoke(params: GetQueryParamsApi = {}): Validated<GetResult<OrganizationDto>> {
    return await super.invoke(params);
  }
}
