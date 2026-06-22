import type { UpdateServiceRepo } from "./update-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import {
  validateUserIds,
  validateDealIds,
  validateServiceIds,
  validateTaskIds,
} from "../../../core/validation/ids-validators";
import { validateAssigneeGuard } from "../../../core/validation/validate-assignee-guard";
import { type ServiceDto, ServiceDtoSchema } from "../service.schema";

import { BaseUpdateServiceSchema } from "./update-service-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";
import { getUserRepo, getUserService, getCustomColumnRepo, getDealRepo, getServiceRepo, getTaskRepo } from "@/core/di";

export const UpdateServiceSchema = BaseUpdateServiceSchema.superRefine(async (data, ctx) => {
  const userSet = new Set(data.userIds ?? []);
  const dealSet = new Set(data.dealIds ?? []);
  const serviceSet = new Set([data.id]);
  const taskSet = new Set(data.taskIds ?? []);

  const [validUserIdsSet, validDealIdsSet, validServiceIdsSet, validTaskIdsSet, allColumns, currentUser, canReadAll] =
    await Promise.all([
      getUserRepo().findIds(userSet),
      getDealRepo().findIds(dealSet),
      getServiceRepo().findIds(serviceSet),
      getTaskRepo().findIds(taskSet),
      getCustomColumnRepo().findByEntityType(EntityType.service),
      getUserService().getActiveUserOrThrow(),
      getUserService().hasPermission(Resource.services, Action.readAll),
    ]);

  validateServiceIds(data.id, validServiceIdsSet, ctx, ["id"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateAssigneeGuard(data.userIds, currentUser.id, canReadAll, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateTaskIds(data.taskIds, validTaskIdsSet, ctx, ["taskIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
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
  ) {
    super();
  }

  @Validate(UpdateServiceSchema)
  @ValidateOutput(ServiceDtoSchema)
  @Transaction
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
