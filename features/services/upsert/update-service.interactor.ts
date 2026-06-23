import type { UpdateServiceRepo } from "./update-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ServiceWritePrecheckInteractor } from "./service-write-precheck.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type ServiceDto, ServiceDtoSchema } from "../service.schema";

import { BaseUpdateServiceSchema } from "./update-service-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";

export const UpdateServiceSchema = BaseUpdateServiceSchema.superRefine((data, ctx) => {
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateServiceData = Data<typeof UpdateServiceSchema>;

@TenantInteractor({
  resource: Resource.services,
  action: Action.update,
})
export class UpdateServiceInteractor extends AuthenticatedInteractor<UpdateServiceData, ServiceDto> {
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
    input: UpdateServiceSchema,
    output: ServiceDtoSchema,
    precheck: (self, data, ctx) => self.precheck.update(data, ctx),
  })
  async invoke(data: UpdateServiceData): Validated<ServiceDto> {
    const previousService = await this.servicesRepo.getOrThrowCompanyWide(data.id);

    const relatedDealIds = unique(
      previousService.deals.map((it) => it.id),
      data.dealIds,
    );
    const relatedTaskIds = unique(
      previousService.tasks.map((it) => it.id),
      data.taskIds,
    );

    const [previousDeals, previousTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const service = await this.servicesRepo.updateServiceOrThrow(data);

    const [currentDeals, currentTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const changes = calculateChanges(previousService, service);

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
      this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
        entityId: service.id,
        payload: { service, changes },
      }),
    ]);

    return { ok: true as const, data: service };
  }
}
