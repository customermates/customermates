import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { FindServicesByIdsRepo, validateServiceIds } from "../../../core/validation/validate-service-ids";

import { DeleteServiceRepo } from "./delete-service.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const DeleteServiceSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const serviceSet = new Set([data.id]);
    const validIdsSet = await preserveTenantContext(() => di.get(FindServicesByIdsRepo).findIds(serviceSet));
    validateServiceIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteServiceData = Data<typeof DeleteServiceSchema>;

@TentantInteractor({ resource: Resource.services, action: Action.delete })
export class DeleteServiceInteractor {
  constructor(
    private repo: DeleteServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteServiceSchema)
  async invoke(data: DeleteServiceData): Validated<string, DeleteServiceData> {
    const previousService = await this.repo.getOrThrowUnscoped(data.id);

    const relatedDealIds = unique(previousService.deals.map((it) => it.id));

    const previousDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

    const service = await this.repo.deleteServiceOrThrow(data.id);

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
      this.eventService.publish(DomainEvent.SERVICE_DELETED, {
        entityId: service.id,
        payload: service,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.id };
  }
}
