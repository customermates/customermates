import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { FindDealsByIdsRepo } from "../../deals/find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { type ServiceDto } from "../service.schema";

import { BaseCreateServiceSchema } from "./create-service-base.schema";
import { CreateServiceRepo } from "./create-service.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateManyServicesSchema = z
  .object({
    services: z.array(BaseCreateServiceSchema).min(1).max(10),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");

    const userSet = new Set<string>();
    const dealSet = new Set<string>();

    for (const service of data.services) {
      service.userIds.forEach((id) => userSet.add(id));
      service.dealIds.forEach((id) => dealSet.add(id));
    }

    const [validUserIdsSet, validDealIdsSet, allColumns] = await preserveTenantContext(async () => {
      return await Promise.all([
        di.get(FindUsersByIdsRepo).findIds(userSet),
        di.get(FindDealsByIdsRepo).findIds(dealSet),
        di.get(FindCustomColumnRepo).findByEntityType(EntityType.service),
      ]);
    });

    for (let i = 0; i < data.services.length; i++) {
      const service = data.services[i];
      validateUserIds(service.userIds, validUserIdsSet, ctx, ["services", i, "userIds"]);
      validateDealIds(service.dealIds, validDealIdsSet, ctx, ["services", i, "dealIds"]);
      validateCustomFieldValues(service.customFieldValues, allColumns, ctx, ["services", i, "customFieldValues"]);
      service.notes = validateNotes(service.notes, ctx, ["services", i, "notes"]);
    }
  });
export type CreateManyServicesData = Data<typeof CreateManyServicesSchema>;

@TentantInteractor({
  resource: Resource.services,
  action: Action.create,
})
export class CreateManyServicesInteractor {
  constructor(
    private repo: CreateServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(CreateManyServicesSchema)
  @Transaction
  async invoke(data: CreateManyServicesData): Validated<ServiceDto[], CreateManyServicesData> {
    const relatedDealIds = unique(data.services.flatMap((service) => service.dealIds));

    const previousDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

    const services = await Promise.all(data.services.map((serviceData) => this.repo.createServiceOrThrow(serviceData)));

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
      ...services.map((service) =>
        this.eventService.publish(DomainEvent.SERVICE_CREATED, {
          entityId: service.id,
          payload: service,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: services };
  }
}
