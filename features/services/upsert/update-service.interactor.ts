import type { UpdateServiceRepo } from "./update-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { type ServiceDto, ServiceDtoSchema } from "../service.schema";

import { BaseUpdateServiceSchema } from "./update-service-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getCustomColumnRepo, getDealRepo, getServiceRepo } from "@/core/di";

export const UpdateServiceSchema = BaseUpdateServiceSchema.superRefine(async (data, ctx) => {
  const userSet = new Set(data.userIds ?? []);
  const dealSet = new Set(data.dealIds ?? []);
  const serviceSet = new Set([data.id]);

  const [validUserIdsSet, validDealIdsSet, validServiceIdsSet, allColumns] = await preserveTenantContext(() =>
    Promise.all([
      getCompanyRepo().findIds(userSet),
      getDealRepo().findIds(dealSet),
      getServiceRepo().findIds(serviceSet),
      getCustomColumnRepo().findByEntityType(EntityType.service),
    ]),
  );

  validateServiceIds(data.id, validServiceIdsSet, ctx, ["id"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateServiceData = Data<typeof UpdateServiceSchema>;

@TentantInteractor({
  resource: Resource.services,
  action: Action.update,
})
export class UpdateServiceInteractor extends BaseInteractor<UpdateServiceData, ServiceDto> {
  constructor(
    private servicesRepo: UpdateServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(UpdateServiceSchema)
  @ValidateOutput(ServiceDtoSchema)
  @Transaction
  async invoke(data: UpdateServiceData): Validated<ServiceDto> {
    const previousService = await this.servicesRepo.getOrThrowUnscoped(data.id);

    const relatedDealIds = unique(
      previousService.deals.map((it) => it.id),
      data.dealIds,
    );

    const previousDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

    const service = await this.servicesRepo.updateServiceOrThrow(data);

    const currentDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

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
      this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
        entityId: service.id,
        payload: { service, changes },
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: service };
  }
}
