import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { FindDealsByIdsRepo } from "../find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";

import { DeleteDealRepo } from "./delete-deal.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";

export const DeleteManyDealsSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(10),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const dealSet = new Set(data.ids);
    const validIdsSet = await preserveTenantContext(() => di.get(FindDealsByIdsRepo).findIds(dealSet));
    validateDealIds(data.ids, validIdsSet, ctx, ["ids"]);
  });
export type DeleteManyDealsData = Data<typeof DeleteManyDealsSchema>;

@TentantInteractor({ resource: Resource.deals, action: Action.delete })
export class DeleteManyDealsInteractor {
  constructor(
    private repo: DeleteDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteManyDealsSchema)
  @Transaction
  async invoke(data: DeleteManyDealsData): Validated<string[], DeleteManyDealsData> {
    const deals = await Promise.all(data.ids.map((id) => this.repo.deleteDealOrThrow(id)));

    await Promise.all([
      ...deals.map((deal) =>
        this.eventService.publish(DomainEvent.DEAL_DELETED, {
          entityId: deal.id,
          payload: deal,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.ids };
  }
}
