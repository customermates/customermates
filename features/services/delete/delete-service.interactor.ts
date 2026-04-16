import type { DeleteServiceRepo } from "./delete-service.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { validateServiceIds } from "../../../core/validation/validate-service-ids";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getServiceRepo } from "@/core/di";

export const DeleteServiceSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const serviceSet = new Set([data.id]);
    const validIdsSet = await preserveTenantContext(() => getServiceRepo().findIds(serviceSet));
    validateServiceIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteServiceData = Data<typeof DeleteServiceSchema>;

@TentantInteractor({ resource: Resource.services, action: Action.delete })
export class DeleteServiceInteractor extends BaseInteractor<DeleteServiceData, string> {
  constructor(
    private repo: DeleteServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(DeleteServiceSchema)
  @ValidateOutput(z.string())
  async invoke(data: DeleteServiceData): Validated<string> {
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

    return { ok: true as const, data: data.id };
  }
}
