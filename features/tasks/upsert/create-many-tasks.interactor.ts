import type { CreateTaskRepo } from "./create-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { BaseCreateTaskSchema } from "./create-task-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { getCompanyRepo, getCustomColumnRepo } from "@/core/di";

export const CreateManyTasksSchema = z
  .object({
    tasks: z.array(BaseCreateTaskSchema).min(1).max(10),
  })
  .superRefine(async (data, ctx) => {
    const userSet = new Set<string>();

    for (const task of data.tasks) task.userIds.forEach((id) => userSet.add(id));

    const [validUserIdsSet, allColumns] = await preserveTenantContext(async () => {
      return await Promise.all([
        getCompanyRepo().findIds(userSet),
        getCustomColumnRepo().findByEntityType(EntityType.task),
      ]);
    });

    for (let i = 0; i < data.tasks.length; i++) {
      const task = data.tasks[i];
      validateUserIds(task.userIds, validUserIdsSet, ctx, ["tasks", i, "userIds"]);
      validateCustomFieldValues(task.customFieldValues, allColumns, ctx, ["tasks", i, "customFieldValues"]);
      task.notes = validateNotes(task.notes, ctx, ["tasks", i, "notes"]);
    }
  });
export type CreateManyTasksData = Data<typeof CreateManyTasksSchema>;

@TentantInteractor({
  resource: Resource.tasks,
  action: Action.create,
})
export class CreateManyTasksInteractor extends BaseInteractor<CreateManyTasksData, TaskDto[]> {
  constructor(
    private repo: CreateTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(CreateManyTasksSchema)
  @ValidateOutput(TaskDtoSchema)
  @Transaction
  async invoke(data: CreateManyTasksData): Validated<TaskDto[]> {
    const tasks = await Promise.all(data.tasks.map((taskData) => this.repo.createTaskOrThrow(taskData)));

    await Promise.all([
      ...tasks.map((task) =>
        this.eventService.publish(DomainEvent.TASK_CREATED, {
          entityId: task.id,
          payload: task,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: tasks };
  }
}
