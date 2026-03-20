import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
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
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";

export const CreateTaskSchema = BaseCreateTaskSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");

  const userSet = new Set(data.userIds);

  const [validUserIdsSet, allColumns] = await preserveTenantContext(() =>
    Promise.all([
      di.get(FindUsersByIdsRepo).findIds(userSet),
      di.get(FindCustomColumnRepo).findByEntityType(EntityType.task),
    ]),
  );

  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateTaskData = Data<typeof CreateTaskSchema>;

@TentantInteractor({
  resource: Resource.tasks,
  action: Action.create,
})
export class CreateTaskInteractor {
  constructor(
    private repo: CreateTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(CreateTaskSchema)
  async invoke(data: CreateTaskData): Validated<TaskDto, CreateTaskData> {
    const task = await this.repo.createTaskOrThrow(data);

    await Promise.all([
      this.eventService.publish(DomainEvent.TASK_CREATED, {
        entityId: task.id,
        payload: task,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: task };
  }
}
