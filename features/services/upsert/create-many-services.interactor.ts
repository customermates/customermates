import type { CreateServiceRepo } from "./create-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateTaskIds } from "../../../core/validation/validate-task-ids";
import { type ServiceDto, ServiceDtoSchema } from "../service.schema";

import { BaseCreateServiceSchema } from "./create-service-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getCustomColumnRepo, getDealRepo, getTaskRepo } from "@/core/app-di";

export const CreateManyServicesSchema = z
  .object({
    services: z.array(BaseCreateServiceSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const userSet = new Set<string>();
    const dealSet = new Set<string>();
    const taskSet = new Set<string>();

    for (const service of data.services) {
      service.userIds.forEach((id) => userSet.add(id));
      service.dealIds.forEach((id) => dealSet.add(id));
      service.taskIds.forEach((id) => taskSet.add(id));
    }

    const [validUserIdsSet, validDealIdsSet, validTaskIdsSet, allColumns] = await Promise.all([
      getCompanyRepo().findIds(userSet),
      getDealRepo().findIds(dealSet),
      getTaskRepo().findIds(taskSet),
      getCustomColumnRepo().findByEntityType(EntityType.service),
    ]);

    for (let i = 0; i < data.services.length; i++) {
      const service = data.services[i];
      validateUserIds(service.userIds, validUserIdsSet, ctx, ["services", i, "userIds"]);
      validateDealIds(service.dealIds, validDealIdsSet, ctx, ["services", i, "dealIds"]);
      validateTaskIds(service.taskIds, validTaskIdsSet, ctx, ["services", i, "taskIds"]);
      validateCustomFieldValues(service.customFieldValues, allColumns, ctx, ["services", i, "customFieldValues"]);
      service.notes = validateNotes(service.notes, ctx, ["services", i, "notes"]);
    }
  });
export type CreateManyServicesData = Data<typeof CreateManyServicesSchema>;

@TenantInteractor({
  resource: Resource.services,
  action: Action.create,
})
export class CreateManyServicesInteractor extends AuthenticatedInteractor<CreateManyServicesData, ServiceDto[]> {
  constructor(
    private repo: CreateServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(CreateManyServicesSchema)
  @ValidateOutput(ServiceDtoSchema)
  @Transaction
  async invoke(data: CreateManyServicesData): Validated<ServiceDto[]> {
    const relatedDealIds = unique(data.services.flatMap((service) => service.dealIds));
    const relatedTaskIds = unique(data.services.flatMap((service) => service.taskIds));

    const [previousDeals, previousTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const services = await Promise.all(data.services.map((serviceData) => this.repo.createServiceOrThrow(serviceData)));

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
        this.eventService.publish(DomainEvent.SERVICE_CREATED, {
          entityId: service.id,
          payload: service,
        }),
      ),
    ]);

    return { ok: true as const, data: services };
  }
}
