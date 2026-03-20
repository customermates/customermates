import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo, validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { FindUsersByIdsRepo, validateUserIds } from "../../../core/validation/validate-user-ids";
import { FindTasksByIdsRepo, validateTaskIds } from "../../../core/validation/validate-task-ids";
import { type TaskDto } from "../task.schema";

import { BaseUpdateTaskSchema } from "./update-task-base.schema";
import { UpdateTaskRepo } from "./update-task.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";

export const UpdateTaskSchema = BaseUpdateTaskSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");

  const userSet = new Set(data.userIds ?? []);
  const taskSet = new Set([data.id]);

  const [validUserIdsSet, validTaskIdsSet, allColumns] = await preserveTenantContext(() =>
    Promise.all([
      di.get(FindUsersByIdsRepo).findIds(userSet),
      di.get(FindTasksByIdsRepo).findIds(taskSet),
      di.get(FindCustomColumnRepo).findByEntityType(EntityType.task),
    ]),
  );

  validateTaskIds(data.id, validTaskIdsSet, ctx, ["id"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateTaskData = Data<typeof UpdateTaskSchema>;

@TentantInteractor({
  resource: Resource.tasks,
  action: Action.update,
})
export class UpdateTaskInteractor {
  constructor(
    private repo: UpdateTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(UpdateTaskSchema)
  @Transaction
  async invoke(data: UpdateTaskData): Validated<TaskDto, UpdateTaskData> {
    const previousTask = await this.repo.getTaskByIdOrThrow(data.id);
    const task = await this.repo.updateTaskOrThrow(data);

    const changes = calculateChanges(previousTask, task);

    await Promise.all([
      this.eventService.publish(DomainEvent.TASK_UPDATED, {
        entityId: task.id,
        payload: {
          task,
          changes,
        },
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: task };
  }
}
