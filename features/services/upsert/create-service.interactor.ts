import type { CreateServiceRepo } from "./create-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { type ServiceDto, ServiceDtoSchema } from "../service.schema";

import { BaseCreateServiceSchema } from "./create-service-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getCustomColumnRepo, getDealRepo } from "@/core/di";

export const CreateServiceSchema = BaseCreateServiceSchema.superRefine(async (data, ctx) => {
  const userSet = new Set(data.userIds);
  const dealSet = new Set(data.dealIds);

  const [validUserIdsSet, validDealIdsSet, allColumns] = await Promise.all([
    getCompanyRepo().findIds(userSet),
    getDealRepo().findIds(dealSet),
    getCustomColumnRepo().findByEntityType(EntityType.service),
  ]);

  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateServiceData = Data<typeof CreateServiceSchema>;

@TentantInteractor({
  resource: Resource.services,
  action: Action.create,
})
export class CreateServiceInteractor extends BaseInteractor<CreateServiceData, ServiceDto> {
  constructor(
    private repo: CreateServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(CreateServiceSchema)
  @ValidateOutput(ServiceDtoSchema)
  async invoke(data: CreateServiceData): Validated<ServiceDto> {
    const relatedDealIds = unique(data.dealIds);

    const previousDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

    const service = await this.repo.createServiceOrThrow(data);

    const currentDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

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
      this.eventService.publish(DomainEvent.SERVICE_CREATED, {
        entityId: service.id,
        payload: service,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: service };
  }
}
