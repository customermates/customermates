import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import {
  FindOrganizationsByIdsRepo,
  validateOrganizationIds,
} from "../../../core/validation/validate-organization-ids";

import { DeleteOrganizationRepo } from "./delete-organization.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const DeleteOrganizationSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const organizationSet = new Set([data.id]);
    const validIdsSet = await preserveTenantContext(() => di.get(FindOrganizationsByIdsRepo).findIds(organizationSet));
    validateOrganizationIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteOrganizationData = Data<typeof DeleteOrganizationSchema>;

@TentantInteractor({ resource: Resource.organizations, action: Action.delete })
export class DeleteOrganizationInteractor {
  constructor(
    private repo: DeleteOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteOrganizationSchema)
  async invoke(data: DeleteOrganizationData): Validated<string, DeleteOrganizationData> {
    const previousOrganization = await this.repo.getOrThrowUnscoped(data.id);

    const relatedContactIds = unique(previousOrganization.contacts.map((it) => it.id));
    const relatedDealIds = unique(previousOrganization.deals.map((it) => it.id));

    const [previousContacts, previousDeals] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const organization = await this.repo.deleteOrganizationOrThrow(data.id);

    const [currentContacts, currentDeals] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    await Promise.all([
      ...currentContacts.map((contact, index) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes: calculateChanges(previousContacts[index], contact),
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
      this.eventService.publish(DomainEvent.ORGANIZATION_DELETED, {
        entityId: organization.id,
        payload: organization,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.id };
  }
}
