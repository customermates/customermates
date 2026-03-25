import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { FindDealsByIdsRepo } from "../find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";

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
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const DeleteManyDealsSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
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
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteManyDealsSchema)
  @Transaction
  async invoke(data: DeleteManyDealsData): Validated<string[], DeleteManyDealsData> {
    const previousDeals = await this.repo.getManyOrThrowUnscoped(data.ids);

    const relatedOrganizationIds = unique(previousDeals.flatMap((deal) => deal.organizations.map((it) => it.id)));
    const relatedContactIds = unique(previousDeals.flatMap((deal) => deal.contacts.map((it) => it.id)));
    const relatedServiceIds = unique(previousDeals.flatMap((deal) => deal.services.map((it) => it.id)));

    const [previousOrganizations, previousContacts, previousServices] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const deals = await Promise.all(data.ids.map((id) => this.repo.deleteDealOrThrow(id)));

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
