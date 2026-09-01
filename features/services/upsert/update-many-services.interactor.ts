import type { UpdateServiceRepo } from "./update-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ServiceWritePrecheckInteractor } from "./service-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type ServiceDto, ServiceDtoSchema } from "../service.schema";

import { BaseUpdateServiceSchema } from "./update-service-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";

export const UpdateManyServicesSchema = z.object({
  services: z
    .array(
      BaseUpdateServiceSchema.superRefine((service, ctx) => {
        service.notes = validateNotes(service.notes, ctx, ["notes"]);
      }),
    )
    .min(1)
    .max(100),
});
export type UpdateManyServicesData = Data<typeof UpdateManyServicesSchema>;

@TenantInteractor({
  resource: Resource.services,
  action: Action.update,
})
export class UpdateManyServicesInteractor extends AuthenticatedInteractor<UpdateManyServicesData, ServiceDto[]> {
  constructor(
    private servicesRepo: UpdateServiceRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
    private precheck: ServiceWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: UpdateManyServicesSchema,
    output: ServiceDtoSchema,
    precheck: (self, data, ctx) => self.precheck.updateMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: UpdateManyServicesData): Validated<ServiceDto[]> {
    const previousServices = await this.servicesRepo.getManyOrThrowCompanyWide(data.services.map((s) => s.id));
    const previousServicesMap = new Map(previousServices.map((s) => [s.id, s]));

    const relatedDealIds = unique(
      previousServices.flatMap((service) => service.deals.map((it) => it.id)),
      data.services.flatMap((serviceData) => serviceData.dealIds ?? []),
    );
    const relatedTaskIds = unique(
      previousServices.flatMap((service) => service.tasks.map((it) => it.id)),
      data.services.flatMap((serviceData) => serviceData.taskIds ?? []),
    );

    const [previousDeals, previousTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const services = await Promise.all(
      data.services.map((serviceData) => this.servicesRepo.updateServiceOrThrow(serviceData)),
    );

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
      ...services.map((service) => {
        const changes = calculateChanges(previousServicesMap.get(service.id), service);

        return this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes,
          },
        });
      }),
    ]);

    return { ok: true as const, data: services };
  }
}
