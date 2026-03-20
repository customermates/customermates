import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type OrganizationDto } from "../organization.schema";

import { GetOrganizationsRepo } from "./get-organizations.interactor";

import { ValidateQueryParamsValidator } from "@/core/base/validate-query-params.validator";
import { P13nRepo } from "@/core/base/base-get.interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsApiSchema } from "@/core/base/base-get.schema";

const GetOrganizationsQueryParamsApiSchema = GetQueryParamsApiSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");
  await di.get(ValidateQueryParamsValidator).invoke(di.get(GetOrganizationsRepo), EntityType.organization, data, ctx);
});

@AllowInDemoMode
@TentantInteractor({
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
  async invoke(params: GetQueryParamsApi = {}): Validated<GetResult<OrganizationDto>, GetQueryParamsApi> {
    return await super.invoke(params);
  }
}
