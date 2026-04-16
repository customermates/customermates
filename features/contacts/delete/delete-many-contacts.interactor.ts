import type { DeleteContactRepo } from "./delete-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { validateContactIds } from "../validate-contact-ids";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getContactRepo } from "@/core/di";

export const DeleteManyContactsSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const contactSet = new Set(data.ids);
    const validIdsSet = await preserveTenantContext(() => getContactRepo().findIds(contactSet));
    validateContactIds(data.ids, validIdsSet, ctx, ["ids"]);
  });
export type DeleteManyContactsData = Data<typeof DeleteManyContactsSchema>;

@TentantInteractor({ resource: Resource.contacts, action: Action.delete })
export class DeleteManyContactsInteractor extends BaseInteractor<DeleteManyContactsData, string[]> {
  constructor(
    private repo: DeleteContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(DeleteManyContactsSchema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteManyContactsData): Validated<string[]> {
    const previousContacts = await this.repo.getManyOrThrowUnscoped(data.ids);

    const relatedOrganizationIds = unique(
      previousContacts.flatMap((contact) => contact.organizations.map((it) => it.id)),
    );
    const relatedDealIds = unique(previousContacts.flatMap((contact) => contact.deals.map((it) => it.id)));

    const [previousOrganizations, previousDeals] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const contacts = await Promise.all(data.ids.map((id) => this.repo.deleteContactOrThrow(id)));

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
      ...contacts.map((contact) =>
        this.eventService.publish(DomainEvent.CONTACT_DELETED, {
          entityId: contact.id,
          payload: contact,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: data.ids };
  }
}
