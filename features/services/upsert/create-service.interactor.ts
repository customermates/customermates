import type { CreateServiceRepo } from "./create-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ServiceWritePrecheckInteractor } from "./service-write-precheck.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type ServiceDto, ServiceDtoSchema } from "../service.schema";

import { BaseCreateServiceSchema } from "./create-service-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateServiceSchema = BaseCreateServiceSchema.superRefine((data, ctx) => {
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateServiceData = Data<typeof CreateServiceSchema>;

@TenantInteractor({
  resource: Resource.services,
  action: Action.create,
})
export class CreateServiceInteractor extends AuthenticatedInteractor<CreateServiceData, ServiceDto> {
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
    input: CreateServiceSchema,
    output: ServiceDtoSchema,
    precheck: (self, data, ctx) => self.precheck.create(data, ctx),
  })
  async invoke(data: CreateServiceData): Validated<ServiceDto> {
    const relatedDealIds = unique(data.dealIds);
    const relatedTaskIds = unique(data.taskIds);

    const [previousDeals, previousTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const service = await this.repo.createServiceOrThrow(data);

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
      this.eventService.publish(DomainEvent.SERVICE_CREATED, {
        entityId: service.id,
        payload: service,
      }),
    ]);

    return { ok: true as const, data: service };
  }
}
