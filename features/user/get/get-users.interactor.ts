import { Resource, Action, Status } from "@/generated/prisma";

import { type UserDto } from "../user.schema";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo, P13nRepo } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

export abstract class GetUsersRepo extends BaseGetRepo<UserDto> {}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetUsersInteractor extends BaseGetInteractor<UserDto> {
  constructor(repo: GetUsersRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "name", direction: "asc" },
      filters: [
        {
          field: FilterFieldKey.status,
          operator: FilterOperatorKey.in,
          value: [Status.active],
        },
      ],
    });
  }

  @Enforce(GetQueryParamsSchema)
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
