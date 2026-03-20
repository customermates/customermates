import type { TaskDto } from "../task.schema";

import { z } from "zod";
import { Resource, Action, TaskType } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { Data } from "@/core/validation/validation.utils";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

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
export class GetTaskByTypeInteractor {
  constructor(private repo: GetTaskByTypeRepo) {}

  @Enforce(Schema)
  async invoke(data: GetTaskByTypeData): Promise<TaskDto | null> {
    return await this.repo.getTaskByType(data.type);
  }
}
