import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type TaskDto } from "../task.schema";

import { GetTasksRepo } from "./get-tasks.interactor";

import { ValidateQueryParamsValidator } from "@/core/base/validate-query-params.validator";
import { P13nRepo } from "@/core/base/base-get.interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsApiSchema } from "@/core/base/base-get.schema";

const GetTasksQueryParamsApiSchema = GetQueryParamsApiSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");
  await di.get(ValidateQueryParamsValidator).invoke(di.get(GetTasksRepo), EntityType.task, data, ctx);
});

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.tasks, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetTasksApiInteractor extends BaseGetInteractor<TaskDto> {
  constructor(repo: GetTasksRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "updatedAt", direction: "desc" },
    });
  }

  @Validate(GetTasksQueryParamsApiSchema)
  async invoke(params: GetQueryParamsApi = {}): Validated<GetResult<TaskDto>, GetQueryParamsApi> {
    return await super.invoke(params);
  }
}
