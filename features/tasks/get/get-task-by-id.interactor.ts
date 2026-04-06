import type { TaskDto } from "../task.schema";

import { z } from "zod";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export const GetTaskByIdSchema = z.object({
  id: z.uuid(),
});

export type GetTaskByIdData = Data<typeof GetTaskByIdSchema>;

export abstract class GetTaskByIdRepo {
  abstract getTaskById(id: string): Promise<TaskDto | null>;
}

export abstract class TaskCustomColumnRepo {
  abstract findByEntityType(entityType: EntityType): Promise<CustomColumnDto[]>;
}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.tasks, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetTaskByIdInteractor {
  constructor(
    private repo: GetTaskByIdRepo,
    private customColumnsRepo: TaskCustomColumnRepo,
  ) {}

  @Validate(GetTaskByIdSchema)
  async invoke(data: GetTaskByIdData): Validated<
    {
      task: TaskDto | null;
      customColumns: CustomColumnDto[];
    },
    GetTaskByIdData
  > {
    const [task, customColumns] = await Promise.all([
      this.repo.getTaskById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.task),
    ]);

    return { ok: true, data: { task, customColumns } };
  }
}
