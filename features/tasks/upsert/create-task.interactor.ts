import type { CreateTaskRepo } from "./create-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { BaseCreateTaskSchema } from "./create-task-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { getCompanyRepo, getCustomColumnRepo } from "@/core/di";

export const CreateTaskSchema = BaseCreateTaskSchema.superRefine(async (data, ctx) => {
  const userSet = new Set(data.userIds);

  const [validUserIdsSet, allColumns] = await Promise.all([
    getCompanyRepo().findIds(userSet),
    getCustomColumnRepo().findByEntityType(EntityType.task),
  ]);

  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateTaskData = Data<typeof CreateTaskSchema>;

@TentantInteractor({
  resource: Resource.tasks,
  action: Action.create,
})
export class CreateTaskInteractor extends BaseInteractor<CreateTaskData, TaskDto> {
  constructor(
    private repo: CreateTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(CreateTaskSchema)
  @ValidateOutput(TaskDtoSchema)
  async invoke(data: CreateTaskData): Validated<TaskDto> {
    const task = await this.repo.createTaskOrThrow(data);

    await Promise.all([
      this.eventService.publish(DomainEvent.TASK_CREATED, {
        entityId: task.id,
        payload: task,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: task };
  }
}
