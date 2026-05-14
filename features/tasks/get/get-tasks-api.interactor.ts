import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParamsApi } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { GetTasksRepo } from "./get-tasks.interactor";
import type { P13nRepo } from "@/core/base/base-get.interactor";

import { EntityType, Resource, Action } from "@/generated/prisma";

import { type TaskDto } from "../task.schema";

import { getTaskRepo, getValidateQueryParams } from "@/core/app-di";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { GetQueryParamsApiSchema, createGetResultSchema } from "@/core/base/base-get.schema";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { TaskDtoSchema } from "../task.schema";

const GetTasksQueryParamsApiSchema = GetQueryParamsApiSchema.superRefine(async (data, ctx) => {
  await getValidateQueryParams().invoke(getTaskRepo(), EntityType.task, data, ctx);
});

@AllowInDemoMode
@TenantInteractor({
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
  @ValidateOutput(createGetResultSchema(TaskDtoSchema))
  async invoke(params: GetQueryParamsApi = {}): Validated<GetResult<TaskDto>> {
    return await super.invoke(params);
  }
}
