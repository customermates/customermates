import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type TaskDto } from "../task.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { TaskDtoSchema } from "../task.schema";

export abstract class GetTasksRepo extends BaseGetRepo<TaskDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.tasks, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetTasksInteractor extends BaseGetInteractor<TaskDto> {
  constructor(
    repo: GetTasksRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      EntityType.task,
      { sortDescriptor: { field: "updatedAt", direction: "desc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(TaskDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
