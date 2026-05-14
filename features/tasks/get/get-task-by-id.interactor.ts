import type { TaskDto } from "../task.schema";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { TaskByIdResponseSchema } from "../task.schema";

import { type CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
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
@TenantInteractor({
  permissions: [
    { resource: Resource.tasks, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetTaskByIdInteractor extends AuthenticatedInteractor<
  GetTaskByIdData,
  { task: TaskDto | null; customColumns: CustomColumnDto[] }
> {
  constructor(
    private repo: GetTaskByIdRepo,
    private customColumnsRepo: TaskCustomColumnRepo,
  ) {
    super();
  }

  @Validate(GetTaskByIdSchema)
  @ValidateOutput(TaskByIdResponseSchema)
  async invoke(data: GetTaskByIdData): Validated<{ task: TaskDto | null; customColumns: CustomColumnDto[] }> {
    const [task, customColumns] = await Promise.all([
      this.repo.getTaskById(data.id),
      this.customColumnsRepo.findByEntityType(EntityType.task),
    ]);

    return { ok: true as const, data: { task, customColumns } };
  }
}
