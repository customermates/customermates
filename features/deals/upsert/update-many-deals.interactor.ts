import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { FindOrganizationsByIdsRepo } from "../../organizations/find-organizations-by-ids.repo";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { FindContactsByIdsRepo } from "../../contacts/find-contacts-by-ids.repo";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { FindServicesByIdsRepo } from "../../services/find-services-by-ids.repo";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { FindDealsByIdsRepo } from "../find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { type DealDto } from "../deal.schema";

import { BaseUpdateDealSchema } from "./update-deal-base.schema";
import { UpdateDealRepo } from "./update-deal.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";

export const UpdateManyDealsSchema = z
  .object({
    deals: z.array(BaseUpdateDealSchema).min(1).max(10),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");

    const organizationSet = new Set<string>();
    const userSet = new Set<string>();
    const contactSet = new Set<string>();
    const serviceSet = new Set<string>();
    const dealSet = new Set<string>();

    for (const deal of data.deals) {
      dealSet.add(deal.id);
      deal.organizationIds?.forEach((id) => organizationSet.add(id));
      deal.userIds?.forEach((id) => userSet.add(id));
      deal.contactIds?.forEach((id) => contactSet.add(id));
      deal.services?.forEach((s) => serviceSet.add(s.serviceId));
    }

    const [validOrgIdsSet, validUserIdsSet, validContactIdsSet, validServiceIdsSet, validDealIdsSet, allColumns] =
      await preserveTenantContext(async () => {
        return await Promise.all([
          di.get(FindOrganizationsByIdsRepo).findIds(organizationSet),
          di.get(FindUsersByIdsRepo).findIds(userSet),
          di.get(FindContactsByIdsRepo).findIds(contactSet),
          di.get(FindServicesByIdsRepo).findIds(serviceSet),
          di.get(FindDealsByIdsRepo).findIds(dealSet),
          di.get(FindCustomColumnRepo).findByEntityType(EntityType.deal),
        ]);
      });

    for (let i = 0; i < data.deals.length; i++) {
      const deal = data.deals[i];
      validateDealIds(deal.id, validDealIdsSet, ctx, ["deals", i, "id"]);
      validateOrganizationIds(deal.organizationIds, validOrgIdsSet, ctx, ["deals", i, "organizationIds"]);
      validateUserIds(deal.userIds, validUserIdsSet, ctx, ["deals", i, "userIds"]);
      validateContactIds(deal.contactIds, validContactIdsSet, ctx, ["deals", i, "contactIds"]);
      validateServiceIds(Array.from(serviceSet), validServiceIdsSet, ctx, ["deals", i, "services"]);
      validateCustomFieldValues(deal.customFieldValues, allColumns, ctx, ["deals", i, "customFieldValues"]);
      deal.notes = validateNotes(deal.notes, ctx, ["deals", i, "notes"]);
    }
  });
export type UpdateManyDealsData = Data<typeof UpdateManyDealsSchema>;

@TentantInteractor({
  resource: Resource.deals,
  action: Action.update,
})
export class UpdateManyDealsInteractor {
  constructor(
    private repo: UpdateDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(UpdateManyDealsSchema)
  @Transaction
  async invoke(data: UpdateManyDealsData): Validated<DealDto[], UpdateManyDealsData> {
    const previousDeals = await Promise.all(data.deals.map((d) => this.repo.getDealByIdOrThrow(d.id)));
    const deals = await Promise.all(data.deals.map((dealData) => this.repo.updateDealOrThrow(dealData)));

    const previousDealsMap = new Map(previousDeals.map((d) => [d.id, d]));

    await Promise.all([
      ...deals.map((deal) => {
        const previousDeal = previousDealsMap.get(deal.id);
        const changes = previousDeal ? calculateChanges(previousDeal, deal) : {};

        return this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        });
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: deals };
  }
}
