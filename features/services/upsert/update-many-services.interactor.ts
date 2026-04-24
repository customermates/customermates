import type { UpdateServiceRepo } from "./update-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
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
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getCustomColumnRepo, getDealRepo, getServiceRepo } from "@/core/di";

export const UpdateManyServicesSchema = z
  .object({
    services: z.array(BaseUpdateServiceSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const userSet = new Set<string>();
    const dealSet = new Set<string>();
    const serviceSet = new Set<string>();

    for (const service of data.services) {
      serviceSet.add(service.id);
      service.userIds?.forEach((id) => userSet.add(id));
      service.dealIds?.forEach((id) => dealSet.add(id));
    }

    const [validUserIdsSet, validDealIdsSet, validServiceIdsSet, allColumns] = await Promise.all([
      getCompanyRepo().findIds(userSet),
      getDealRepo().findIds(dealSet),
      getServiceRepo().findIds(serviceSet),
      getCustomColumnRepo().findByEntityType(EntityType.service),
    ]);

    for (let i = 0; i < data.services.length; i++) {
      const service = data.services[i];
      validateServiceIds(service.id, validServiceIdsSet, ctx, ["services", i, "id"]);
      validateUserIds(service.userIds, validUserIdsSet, ctx, ["services", i, "userIds"]);
      validateDealIds(service.dealIds, validDealIdsSet, ctx, ["services", i, "dealIds"]);
      validateCustomFieldValues(service.customFieldValues, allColumns, ctx, ["services", i, "customFieldValues"]);
      service.notes = validateNotes(service.notes, ctx, ["services", i, "notes"]);
    }
  });
export type UpdateManyServicesData = Data<typeof UpdateManyServicesSchema>;

@TentantInteractor({
  resource: Resource.services,
  action: Action.update,
})
export class UpdateManyServicesInteractor extends BaseInteractor<UpdateManyServicesData, ServiceDto[]> {
  constructor(
    private servicesRepo: UpdateServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
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

    const previousDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

    const services = await Promise.all(
      data.services.map((serviceData) => this.servicesRepo.updateServiceOrThrow(serviceData)),
    );

    const currentDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

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
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: services };
  }
}
