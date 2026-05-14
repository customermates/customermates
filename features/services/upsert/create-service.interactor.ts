import type { CreateServiceRepo } from "./create-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
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
import { validateNotes } from "@/core/validation/validate-notes";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getCustomColumnRepo, getDealRepo, getTaskRepo } from "@/core/app-di";

export const CreateServiceSchema = BaseCreateServiceSchema.superRefine(async (data, ctx) => {
  const userSet = new Set(data.userIds);
  const dealSet = new Set(data.dealIds);
  const taskSet = new Set(data.taskIds);

  const [validUserIdsSet, validDealIdsSet, validTaskIdsSet, allColumns] = await Promise.all([
    getCompanyRepo().findIds(userSet),
    getDealRepo().findIds(dealSet),
    getTaskRepo().findIds(taskSet),
    getCustomColumnRepo().findByEntityType(EntityType.service),
  ]);

  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateTaskIds(data.taskIds, validTaskIdsSet, ctx, ["taskIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
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
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(CreateServiceSchema)
  @ValidateOutput(ServiceDtoSchema)
  @Transaction
  async invoke(data: CreateServiceData): Validated<ServiceDto> {
    const relatedDealIds = unique(data.dealIds);
    const relatedTaskIds = unique(data.taskIds);

    const [previousDeals, previousTasks] = await Promise.all([
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const service = await this.repo.createServiceOrThrow(data);

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
      this.eventService.publish(DomainEvent.SERVICE_CREATED, {
        entityId: service.id,
        payload: service,
      }),
    ]);

    return { ok: true as const, data: service };
  }
}
