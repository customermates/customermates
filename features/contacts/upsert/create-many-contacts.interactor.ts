import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { FindDealsByIdsRepo } from "../../deals/find-deals-by-ids.repo";
import { FindOrganizationsByIdsRepo } from "../../organizations/find-organizations-by-ids.repo";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { type ContactDto } from "../contact.schema";

import { BaseCreateContactSchema } from "./create-contact-base.schema";
import { CreateContactRepo } from "./create-contact.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateManyContactsSchema = z
  .object({
    contacts: z.array(BaseCreateContactSchema).min(1).max(10),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");

    const organizationSet = new Set<string>();
    const userSet = new Set<string>();
    const dealSet = new Set<string>();

    for (const contact of data.contacts) {
      contact.organizationIds.forEach((id) => organizationSet.add(id));
      contact.userIds.forEach((id) => userSet.add(id));
      contact.dealIds.forEach((id) => dealSet.add(id));
    }

    const [validOrgIdsSet, validUserIdsSet, validDealIdsSet, allColumns] = await preserveTenantContext(async () => {
      return await Promise.all([
        di.get(FindOrganizationsByIdsRepo).findIds(organizationSet),
        di.get(FindUsersByIdsRepo).findIds(userSet),
        di.get(FindDealsByIdsRepo).findIds(dealSet),
        di.get(FindCustomColumnRepo).findByEntityType(EntityType.contact),
      ]);
    });

    for (let i = 0; i < data.contacts.length; i++) {
      const contact = data.contacts[i];
      validateOrganizationIds(contact.organizationIds, validOrgIdsSet, ctx, ["contacts", i, "organizationIds"]);
      validateUserIds(contact.userIds, validUserIdsSet, ctx, ["contacts", i, "userIds"]);
      validateDealIds(contact.dealIds, validDealIdsSet, ctx, ["contacts", i, "dealIds"]);
      validateCustomFieldValues(contact.customFieldValues, allColumns, ctx, ["contacts", i, "customFieldValues"]);
      contact.notes = validateNotes(contact.notes, ctx, ["contacts", i, "notes"]);
    }
  });
export type CreateManyContactsData = Data<typeof CreateManyContactsSchema>;

@TentantInteractor({
  resource: Resource.contacts,
  action: Action.create,
})
export class CreateManyContactsInteractor {
  constructor(
    private repo: CreateContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(CreateManyContactsSchema)
  @Transaction
  async invoke(data: CreateManyContactsData): Validated<ContactDto[], CreateManyContactsData> {
    const relatedOrganizationIds = unique(data.contacts.flatMap((contact) => contact.organizationIds));
    const relatedDealIds = unique(data.contacts.flatMap((contact) => contact.dealIds));

    const [previousOrganizations, previousDeals] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const contacts = await Promise.all(data.contacts.map((contactData) => this.repo.createContactOrThrow(contactData)));

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
        this.eventService.publish(DomainEvent.CONTACT_CREATED, {
          entityId: contact.id,
          payload: contact,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: contacts };
  }
}
