import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { FindServicesByIdsRepo } from "../find-services-by-ids.repo";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";

import { DeleteServiceRepo } from "./delete-service.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const DeleteManyServicesSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const serviceSet = new Set(data.ids);
    const validIdsSet = await preserveTenantContext(() => di.get(FindServicesByIdsRepo).findIds(serviceSet));
    validateServiceIds(data.ids, validIdsSet, ctx, ["ids"]);
  });
export type DeleteManyServicesData = Data<typeof DeleteManyServicesSchema>;

@TentantInteractor({ resource: Resource.services, action: Action.delete })
export class DeleteManyServicesInteractor {
  constructor(
    private repo: DeleteServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteManyServicesSchema)
  @Transaction
  async invoke(data: DeleteManyServicesData): Validated<string[], DeleteManyServicesData> {
    const previousServices = await this.repo.getManyOrThrowUnscoped(data.ids);

    const relatedDealIds = unique(previousServices.flatMap((service) => service.deals.map((it) => it.id)));

    const previousDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

    const services = await Promise.all(data.ids.map((id) => this.repo.deleteServiceOrThrow(id)));

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
        this.eventService.publish(DomainEvent.SERVICE_DELETED, {
          entityId: service.id,
          payload: service,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.ids };
  }
}
