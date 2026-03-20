import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { FindDealsByIdsRepo } from "../find-deals-by-ids.repo";

import { DeleteDealRepo } from "./delete-deal.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { validateDealIds } from "@/core/validation/validate-deal-ids";
import { preserveTenantContext } from "@/core/decorators/tenant-context";

export const DeleteDealSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const dealSet = new Set([data.id]);
    const validIdsSet = await preserveTenantContext(() => di.get(FindDealsByIdsRepo).findIds(dealSet));
    validateDealIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteDealData = Data<typeof DeleteDealSchema>;

@TentantInteractor({ resource: Resource.deals, action: Action.delete })
export class DeleteDealInteractor {
  constructor(
    private repo: DeleteDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteDealSchema)
  async invoke(data: DeleteDealData): Validated<string, DeleteDealData> {
    const deal = await this.repo.deleteDealOrThrow(data.id);

    await Promise.all([
      this.eventService.publish(DomainEvent.DEAL_DELETED, {
        entityId: deal.id,
        payload: deal,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.id };
  }
}
