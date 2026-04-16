import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { GetContactsRepo } from "./get-contacts.interactor";
import type { P13nRepo } from "@/core/base/base-get.interactor";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type ContactDto } from "../contact.schema";

import { getContactRepo, getValidateQueryParams } from "@/core/di";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsApiSchema, createGetResultSchema } from "@/core/base/base-get.schema";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { ContactDtoSchema } from "../contact.schema";

const GetContactsQueryParamsApiSchema = GetQueryParamsApiSchema.superRefine(async (data, ctx) => {
  await getValidateQueryParams().invoke(getContactRepo(), EntityType.contact, data, ctx);
});

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetContactsApiInteractor extends BaseGetInteractor<ContactDto> {
  constructor(repo: GetContactsRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "name", direction: "asc" },
    });
  }

  @Validate(GetContactsQueryParamsApiSchema)
  @ValidateOutput(createGetResultSchema(ContactDtoSchema))
  async invoke(params: GetQueryParamsApi = {}): Validated<GetResult<ContactDto>> {
    return await super.invoke(params);
  }
}
