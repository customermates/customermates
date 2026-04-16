import type { CreateContactRepo } from "./create-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { type ContactDto, ContactDtoSchema } from "../contact.schema";

import { BaseCreateContactSchema } from "./create-contact-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getCustomColumnRepo, getDealRepo, getOrganizationRepo } from "@/core/di";

export const CreateManyContactsSchema = z
  .object({
    contacts: z.array(BaseCreateContactSchema).min(1).max(10),
  })
  .superRefine(async (data, ctx) => {
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
        getOrganizationRepo().findIds(organizationSet),
        getCompanyRepo().findIds(userSet),
        getDealRepo().findIds(dealSet),
        getCustomColumnRepo().findByEntityType(EntityType.contact),
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
export class CreateManyContactsInteractor extends BaseInteractor<CreateManyContactsData, ContactDto[]> {
  constructor(
    private repo: CreateContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(CreateManyContactsSchema)
  @ValidateOutput(ContactDtoSchema)
  @Transaction
  async invoke(data: CreateManyContactsData): Validated<ContactDto[]> {
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

    return { ok: true as const, data: contacts };
  }
}
