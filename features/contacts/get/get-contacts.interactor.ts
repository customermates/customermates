import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type ContactDto } from "../contact.schema";

import { BaseGetRepo } from "@/core/base/base-get.interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { ContactDtoSchema } from "../contact.schema";

export abstract class GetContactsRepo extends BaseGetRepo<ContactDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetContactsInteractor extends BaseGetInteractor<ContactDto> {
  constructor(
    repo: GetContactsRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      EntityType.contact,
      { sortDescriptor: { field: "name", direction: "asc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(ContactDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
