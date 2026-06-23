import type { DeleteServiceRepo } from "./delete-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ServiceWritePrecheckInteractor } from "../upsert/service-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const DeleteManyServicesSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
});
export type DeleteManyServicesData = Data<typeof DeleteManyServicesSchema>;

@TenantInteractor({ resource: Resource.services, action: Action.delete })
export class DeleteManyServicesInteractor extends AuthenticatedInteractor<DeleteManyServicesData, string[]> {
  constructor(
    private repo: DeleteServiceRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
    private precheck: ServiceWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: DeleteManyServicesSchema,
    output: z.string(),
    precheck: (self, data, ctx) => self.precheck.deleteMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: DeleteManyServicesData): Validated<string[]> {
    const previousServices = await this.repo.getManyOrThrowCompanyWide(data.ids);

    const relatedDealIds = unique(previousServices.flatMap((service) => service.deals.map((it) => it.id)));
    const relatedTaskIds = unique(previousServices.flatMap((service) => service.tasks.map((it) => it.id)));

    const [previousDeals, previousTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const services = await Promise.all(data.ids.map((id) => this.repo.deleteServiceOrThrow(id)));

    const [currentDeals, currentTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    await Promise.all([
      ...buildRelationChangePublishes(
        previousDeals,
        currentDeals,
        "services",
        (deal, changes) =>
          this.eventService.publish(DomainEvent.DEAL_UPDATED, {
            entityId: deal.id,
            payload: {
              deal,
              changes,
            },
          }),
        ["totalValue", "totalQuantity"],
      ),
      ...buildRelationChangePublishes(previousTasks, currentTasks, "services", (task, changes) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes,
          },
        }),
      ),
      ...services.map((service) =>
        this.eventService.publish(DomainEvent.SERVICE_DELETED, {
          entityId: service.id,
          payload: service,
        }),
      ),
    ]);

    return { ok: true as const, data: data.ids };
  }
}
