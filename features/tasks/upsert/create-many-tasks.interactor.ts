import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { type TaskDto } from "../task.schema";

import { BaseCreateTaskSchema } from "./create-task-base.schema";
import { CreateTaskRepo } from "./create-task.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";

export const CreateManyTasksSchema = z
  .object({
    tasks: z.array(BaseCreateTaskSchema).min(1).max(10),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");

    const userSet = new Set<string>();

    for (const task of data.tasks) task.userIds.forEach((id) => userSet.add(id));

    const [validUserIdsSet, allColumns] = await preserveTenantContext(async () => {
      return await Promise.all([
        di.get(FindUsersByIdsRepo).findIds(userSet),
        di.get(FindCustomColumnRepo).findByEntityType(EntityType.task),
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
export class CreateManyTasksInteractor {
  constructor(
    private repo: CreateTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(CreateManyTasksSchema)
  @Transaction
  async invoke(data: CreateManyTasksData): Validated<TaskDto[], CreateManyTasksData> {
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

    return { ok: true, data: tasks };
  }
}
