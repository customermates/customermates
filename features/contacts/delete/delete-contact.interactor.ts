import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { FindContactsByIdsRepo } from "../find-contacts-by-ids.repo";
import { validateContactIds } from "../validate-contact-ids";

import { DeleteContactRepo } from "./delete-contact.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const DeleteContactSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const contactSet = new Set([data.id]);
    const validIdsSet = await preserveTenantContext(() => di.get(FindContactsByIdsRepo).findIds(contactSet));
    validateContactIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteContactData = Data<typeof DeleteContactSchema>;

@TentantInteractor({ resource: Resource.contacts, action: Action.delete })
export class DeleteContactInteractor {
  constructor(
    private repo: DeleteContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteContactSchema)
  async invoke(data: DeleteContactData): Validated<string, DeleteContactData> {
    const previousContact = await this.repo.getOrThrowUnscoped(data.id);

    const relatedOrganizationIds = unique(previousContact.organizations.map((it) => it.id));
    const relatedDealIds = unique(previousContact.deals.map((it) => it.id));

    const [previousOrganizations, previousDeals] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const contact = await this.repo.deleteContactOrThrow(data.id);

    const [currentOrganizations, currentDeals] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    await Promise.all([
      ...currentOrganizations.map((organization, index) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes: calculateChanges(previousOrganizations[index], organization),
          },
        }),
      ),
      ...currentDeals.map((deal, index) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes: calculateChanges(previousDeals[index], deal),
          },
        }),
      ),
      this.eventService.publish(DomainEvent.CONTACT_DELETED, {
        entityId: contact.id,
        payload: contact,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.id };
  }
}
