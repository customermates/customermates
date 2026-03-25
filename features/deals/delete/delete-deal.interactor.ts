import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { FindDealsByIdsRepo } from "../find-deals-by-ids.repo";

import { DeleteDealRepo } from "./delete-deal.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { validateDealIds } from "@/core/validation/validate-deal-ids";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

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
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteDealSchema)
  async invoke(data: DeleteDealData): Validated<string, DeleteDealData> {
    const previousDeal = await this.repo.getOrThrowUnscoped(data.id);

    const relatedOrganizationIds = unique(previousDeal.organizations.map((it) => it.id));
    const relatedContactIds = unique(previousDeal.contacts.map((it) => it.id));
    const relatedServiceIds = unique(previousDeal.services.map((it) => it.id));

    const [previousOrganizations, previousContacts, previousServices] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const deal = await this.repo.deleteDealOrThrow(data.id);

    const [currentOrganizations, currentContacts, currentServices] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
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
      ...currentContacts.map((contact, index) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes: calculateChanges(previousContacts[index], contact),
          },
        }),
      ),
      ...currentServices.map((service, index) =>
        this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes: calculateChanges(previousServices[index], service),
          },
        }),
      ),
      this.eventService.publish(DomainEvent.DEAL_DELETED, {
        entityId: deal.id,
        payload: deal,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.id };
  }
}
