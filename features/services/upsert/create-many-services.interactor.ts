import type { CreateServiceRepo } from "./create-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ServiceWritePrecheckInteractor } from "./service-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type ServiceDto, ServiceDtoSchema } from "../service.schema";

import { BaseCreateServiceSchema } from "./create-service-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateManyServicesSchema = z.object({
  services: z
    .array(
      BaseCreateServiceSchema.superRefine((service, ctx) => {
        service.notes = validateNotes(service.notes, ctx, ["notes"]);
      }),
    )
    .min(1)
    .max(100),
});
export type CreateManyServicesData = Data<typeof CreateManyServicesSchema>;

@TenantInteractor({
  resource: Resource.services,
  action: Action.create,
})
export class CreateManyServicesInteractor extends AuthenticatedInteractor<CreateManyServicesData, ServiceDto[]> {
  constructor(
    private repo: CreateServiceRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
    private precheck: ServiceWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: CreateManyServicesSchema,
    output: ServiceDtoSchema,
    precheck: (self, data, ctx) => self.precheck.createMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: CreateManyServicesData): Validated<ServiceDto[]> {
    const relatedDealIds = unique(data.services.flatMap((service) => service.dealIds));
    const relatedTaskIds = unique(data.services.flatMap((service) => service.taskIds));

    const [previousDeals, previousTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const services = await Promise.all(data.services.map((serviceData) => this.repo.createServiceOrThrow(serviceData)));

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
        this.eventService.publish(DomainEvent.SERVICE_CREATED, {
          entityId: service.id,
          payload: service,
        }),
      ),
    ]);

    return { ok: true as const, data: services };
  }
}
