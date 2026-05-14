import type { UpdateServiceRepo } from "./update-service.repo";
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
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { validateTaskIds } from "../../../core/validation/validate-task-ids";
import { type ServiceDto, ServiceDtoSchema } from "../service.schema";

import { BaseUpdateServiceSchema } from "./update-service-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getCustomColumnRepo, getDealRepo, getServiceRepo, getTaskRepo } from "@/core/app-di";

export const UpdateManyServicesSchema = z
  .object({
    services: z.array(BaseUpdateServiceSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const userSet = new Set<string>();
    const dealSet = new Set<string>();
    const serviceSet = new Set<string>();
    const taskSet = new Set<string>();

    for (const service of data.services) {
      serviceSet.add(service.id);
      service.userIds?.forEach((id) => userSet.add(id));
      service.dealIds?.forEach((id) => dealSet.add(id));
      service.taskIds?.forEach((id) => taskSet.add(id));
    }

    const [validUserIdsSet, validDealIdsSet, validServiceIdsSet, validTaskIdsSet, allColumns] = await Promise.all([
      getCompanyRepo().findIds(userSet),
      getDealRepo().findIds(dealSet),
      getServiceRepo().findIds(serviceSet),
      getTaskRepo().findIds(taskSet),
      getCustomColumnRepo().findByEntityType(EntityType.service),
    ]);

    for (let i = 0; i < data.services.length; i++) {
      const service = data.services[i];
      validateServiceIds(service.id, validServiceIdsSet, ctx, ["services", i, "id"]);
      validateUserIds(service.userIds, validUserIdsSet, ctx, ["services", i, "userIds"]);
      validateDealIds(service.dealIds, validDealIdsSet, ctx, ["services", i, "dealIds"]);
      validateTaskIds(service.taskIds, validTaskIdsSet, ctx, ["services", i, "taskIds"]);
      validateCustomFieldValues(service.customFieldValues, allColumns, ctx, ["services", i, "customFieldValues"]);
      service.notes = validateNotes(service.notes, ctx, ["services", i, "notes"]);
    }
  });
export type UpdateManyServicesData = Data<typeof UpdateManyServicesSchema>;

@TenantInteractor({
  resource: Resource.services,
  action: Action.update,
})
export class UpdateManyServicesInteractor extends AuthenticatedInteractor<UpdateManyServicesData, ServiceDto[]> {
  constructor(
    private servicesRepo: UpdateServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpdateManyServicesSchema)
  @ValidateOutput(ServiceDtoSchema)
  @Transaction
  async invoke(data: UpdateManyServicesData): Validated<ServiceDto[]> {
    const previousServices = await this.servicesRepo.getManyOrThrowUnscoped(data.services.map((s) => s.id));
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
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const services = await Promise.all(
      data.services.map((serviceData) => this.servicesRepo.updateServiceOrThrow(serviceData)),
    );

    const [currentDeals, currentTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
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
        const previousService = previousServicesMap.get(service.id);
        const changes = previousService ? calculateChanges(previousService, service) : {};

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
