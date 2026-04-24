import type { UpdateTaskRepo } from "./update-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
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
import { validateNotes } from "@/core/validation/validate-notes";
import { getCompanyRepo, getCustomColumnRepo, getTaskRepo } from "@/core/di";

export const UpdateTaskSchema = BaseUpdateTaskSchema.superRefine(async (data, ctx) => {
  const userSet = new Set(data.userIds ?? []);
  const taskSet = new Set([data.id]);

  const [validUserIdsSet, validTaskIdsSet, allColumns] = await Promise.all([
    getCompanyRepo().findIds(userSet),
    getTaskRepo().findIds(taskSet),
    getCustomColumnRepo().findByEntityType(EntityType.task),
  ]);

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
export class UpdateTaskInteractor extends BaseInteractor<UpdateTaskData, TaskDto> {
  constructor(
    private repo: UpdateTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(UpdateTaskSchema)
  @ValidateOutput(TaskDtoSchema)
  @Transaction
  async invoke(data: UpdateTaskData): Validated<TaskDto> {
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

    return { ok: true as const, data: task };
  }
}
