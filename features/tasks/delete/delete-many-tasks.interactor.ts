import type { DeleteTaskRepo } from "./delete-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { validateTaskIds, validateSystemTaskIds } from "../../../core/validation/validate-task-ids";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { getTaskRepo } from "@/core/di";

export const DeleteManyTasksSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const taskSet = new Set(data.ids);
    const repo = getTaskRepo();
    const [validIdsSet, systemTaskIdsSet] = await Promise.all([repo.findIds(taskSet), repo.findSystemTaskIds(taskSet)]);
    validateTaskIds(data.ids, validIdsSet, ctx, ["ids"]);
    validateSystemTaskIds(data.ids, systemTaskIdsSet, ctx, ["ids"]);
  });
export type DeleteManyTasksData = Data<typeof DeleteManyTasksSchema>;

@TentantInteractor({ resource: Resource.tasks, action: Action.delete })
export class DeleteManyTasksInteractor extends BaseInteractor<DeleteManyTasksData, string[]> {
  constructor(
    private repo: DeleteTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(DeleteManyTasksSchema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteManyTasksData): Validated<string[]> {
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

    return { ok: true as const, data: data.ids };
  }
}
