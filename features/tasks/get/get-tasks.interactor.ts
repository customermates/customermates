import { Resource, Action } from "@/generated/prisma";

import { type TaskDto } from "../task.schema";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo, P13nRepo } from "@/core/base/base-get.interactor";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { GetQueryParamsSchema, type GetQueryParams } from "@/core/base/base-get.schema";

export abstract class GetTasksRepo extends BaseGetRepo<TaskDto> {}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.tasks, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetTasksInteractor extends BaseGetInteractor<TaskDto> {
  constructor(repo: GetTasksRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "updatedAt", direction: "desc" },
    });
  }

  @Enforce(GetQueryParamsSchema)
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
