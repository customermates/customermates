import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { DeleteTaskRepo } from "./delete-task.repo";

import { FindTasksByIdsRepo, validateTaskIds, validateSystemTaskIds } from "@/core/validation/validate-task-ids";
import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";

export const DeleteTaskSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const taskSet = new Set([data.id]);
    const [validIdsSet, systemTaskIdsSet] = await preserveTenantContext(async () => {
      const repo = di.get(FindTasksByIdsRepo);
      return Promise.all([repo.findIds(taskSet), repo.findSystemTaskIds(taskSet)]);
    });
    validateTaskIds(data.id, validIdsSet, ctx, ["id"]);
    validateSystemTaskIds(data.id, systemTaskIdsSet, ctx, ["id"]);
  });
export type DeleteTaskData = Data<typeof DeleteTaskSchema>;

@TentantInteractor({ resource: Resource.tasks, action: Action.delete })
export class DeleteTaskInteractor {
  constructor(
    private repo: DeleteTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteTaskSchema)
  async invoke(data: DeleteTaskData): Validated<string, DeleteTaskData> {
    const task = await this.repo.deleteTaskOrThrow(data.id);

    await Promise.all([
      this.eventService.publish(DomainEvent.TASK_DELETED, {
        entityId: task.id,
        payload: task,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.id };
  }
}
