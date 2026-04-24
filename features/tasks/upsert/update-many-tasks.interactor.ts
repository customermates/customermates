import type { UpdateTaskRepo } from "./update-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateTaskIds } from "../../../core/validation/validate-task-ids";
import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { BaseUpdateTaskSchema } from "./update-task-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { getCompanyRepo, getCustomColumnRepo, getTaskRepo } from "@/core/di";

export const UpdateManyTasksSchema = z
  .object({
    tasks: z.array(BaseUpdateTaskSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const userSet = new Set<string>();
    const taskSet = new Set<string>();

    for (const task of data.tasks) {
      taskSet.add(task.id);
      task.userIds?.forEach((id) => userSet.add(id));
    }

    const [validUserIdsSet, validTaskIdsSet, allColumns] = await Promise.all([
      getCompanyRepo().findIds(userSet),
      getTaskRepo().findIds(taskSet),
      getCustomColumnRepo().findByEntityType(EntityType.task),
    ]);

    for (let i = 0; i < data.tasks.length; i++) {
      const task = data.tasks[i];
      validateTaskIds(task.id, validTaskIdsSet, ctx, ["tasks", i, "id"]);
      validateUserIds(task.userIds, validUserIdsSet, ctx, ["tasks", i, "userIds"]);
      validateCustomFieldValues(task.customFieldValues, allColumns, ctx, ["tasks", i, "customFieldValues"]);
      task.notes = validateNotes(task.notes, ctx, ["tasks", i, "notes"]);
    }
  });
export type UpdateManyTasksData = Data<typeof UpdateManyTasksSchema>;

@TentantInteractor({
  resource: Resource.tasks,
  action: Action.update,
})
export class UpdateManyTasksInteractor extends BaseInteractor<UpdateManyTasksData, TaskDto[]> {
  constructor(
    private repo: UpdateTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(UpdateManyTasksSchema)
  @ValidateOutput(TaskDtoSchema)
  @Transaction
  async invoke(data: UpdateManyTasksData): Validated<TaskDto[]> {
    const previousTasks = await Promise.all(data.tasks.map((t) => this.repo.getTaskByIdOrThrow(t.id)));
    const tasks = await Promise.all(data.tasks.map((taskData) => this.repo.updateTaskOrThrow(taskData)));

    const previousTasksMap = new Map(previousTasks.map((t) => [t.id, t]));

    await Promise.all([
      ...tasks.map((task) => {
        const previousTask = previousTasksMap.get(task.id);
        const changes = previousTask ? calculateChanges(previousTask, task) : {};

        return this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes,
          },
        });
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: tasks };
  }
}
