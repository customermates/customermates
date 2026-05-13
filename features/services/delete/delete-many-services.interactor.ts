import type { DeleteServiceRepo } from "./delete-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { validateServiceIds } from "../../../core/validation/validate-service-ids";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getServiceRepo } from "@/core/app-di";

export const DeleteManyServicesSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const serviceSet = new Set(data.ids);
    const validIdsSet = await getServiceRepo().findIds(serviceSet);
    validateServiceIds(data.ids, validIdsSet, ctx, ["ids"]);
  });
export type DeleteManyServicesData = Data<typeof DeleteManyServicesSchema>;

@TentantInteractor({ resource: Resource.services, action: Action.delete })
export class DeleteManyServicesInteractor extends BaseInteractor<DeleteManyServicesData, string[]> {
  constructor(
    private repo: DeleteServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(DeleteManyServicesSchema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteManyServicesData): Validated<string[]> {
    const previousServices = await this.repo.getManyOrThrowUnscoped(data.ids);

    const relatedDealIds = unique(previousServices.flatMap((service) => service.deals.map((it) => it.id)));
    const relatedTaskIds = unique(previousServices.flatMap((service) => service.tasks.map((it) => it.id)));

    const [previousDeals, previousTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const services = await Promise.all(data.ids.map((id) => this.repo.deleteServiceOrThrow(id)));

    const [currentDeals, currentTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    await Promise.all([
      ...currentDeals.map((deal, index) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes: calculateChanges(previousDeals[index], deal),
          },
        }),
      ),
      ...currentTasks.map((task, index) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes: calculateChanges(previousTasks[index], task),
          },
        }),
      ),
      ...services.map((service) =>
        this.eventService.publish(DomainEvent.SERVICE_DELETED, {
          entityId: service.id,
          payload: service,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: data.ids };
  }
}
