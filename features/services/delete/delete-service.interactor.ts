import type { DeleteServiceRepo } from "./delete-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { validateServiceIds } from "../../../core/validation/validate-service-ids";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getServiceRepo } from "@/core/app-di";

export const DeleteServiceSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const serviceSet = new Set([data.id]);
    const validIdsSet = await getServiceRepo().findIds(serviceSet);
    validateServiceIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteServiceData = Data<typeof DeleteServiceSchema>;

@TenantInteractor({ resource: Resource.services, action: Action.delete })
export class DeleteServiceInteractor extends AuthenticatedInteractor<DeleteServiceData, string> {
  constructor(
    private repo: DeleteServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(DeleteServiceSchema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteServiceData): Validated<string> {
    const previousService = await this.repo.getOrThrowUnscoped(data.id);

    const relatedDealIds = unique(previousService.deals.map((it) => it.id));
    const relatedTaskIds = unique(previousService.tasks.map((it) => it.id));

    const [previousDeals, previousTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const service = await this.repo.deleteServiceOrThrow(data.id);

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
      this.eventService.publish(DomainEvent.SERVICE_DELETED, {
        entityId: service.id,
        payload: service,
      }),
    ]);

    return { ok: true as const, data: data.id };
  }
}
