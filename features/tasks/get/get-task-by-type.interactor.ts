import type { TaskDto } from "../task.schema";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, TaskType } from "@/generated/prisma";

import { TaskDtoSchema } from "../task.schema";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  type: z.enum(TaskType),
});
export type GetTaskByTypeData = Data<typeof Schema>;

export abstract class GetTaskByTypeRepo {
  abstract getTaskByType(type: TaskType): Promise<TaskDto | null>;
}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.tasks, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetTaskByTypeInteractor extends BaseInteractor<GetTaskByTypeData, TaskDto | null> {
  constructor(private repo: GetTaskByTypeRepo) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(TaskDtoSchema)
  async invoke(data: GetTaskByTypeData): Promise<{ ok: true; data: TaskDto | null }> {
    return { ok: true as const, data: await this.repo.getTaskByType(data.type) };
  }
}
