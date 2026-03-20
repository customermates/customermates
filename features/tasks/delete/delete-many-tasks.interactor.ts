import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { FindTasksByIdsRepo, validateTaskIds, validateSystemTaskIds } from "../../../core/validation/validate-task-ids";

import { DeleteTaskRepo } from "./delete-task.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";

export const DeleteManyTasksSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(10),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const taskSet = new Set(data.ids);
    const [validIdsSet, systemTaskIdsSet] = await preserveTenantContext(async () => {
      const repo = di.get(FindTasksByIdsRepo);
      return Promise.all([repo.findIds(taskSet), repo.findSystemTaskIds(taskSet)]);
    });
    validateTaskIds(data.ids, validIdsSet, ctx, ["ids"]);
    validateSystemTaskIds(data.ids, systemTaskIdsSet, ctx, ["ids"]);
  });
export type DeleteManyTasksData = Data<typeof DeleteManyTasksSchema>;

@TentantInteractor({ resource: Resource.tasks, action: Action.delete })
export class DeleteManyTasksInteractor {
  constructor(
    private repo: DeleteTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteManyTasksSchema)
  @Transaction
  async invoke(data: DeleteManyTasksData): Validated<string[], DeleteManyTasksData> {
    const tasks = await Promise.all(data.ids.map((id) => this.repo.deleteTaskOrThrow(id)));

    await Promise.all([
      ...tasks.map((task) =>
        this.eventService.publish(DomainEvent.TASK_DELETED, {
          entityId: task.id,
          payload: task,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.ids };
  }
}
