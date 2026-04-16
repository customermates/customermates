import type { UpdateContactRepo } from "./update-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateContactIds } from "../validate-contact-ids";
import { type ContactDto, ContactDtoSchema } from "../contact.schema";

import { BaseUpdateContactSchema } from "./update-contact-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getContactRepo, getCustomColumnRepo, getDealRepo, getOrganizationRepo } from "@/core/di";

export const UpdateManyContactsSchema = z
  .object({
    contacts: z.array(BaseUpdateContactSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const organizationSet = new Set<string>();
    const userSet = new Set<string>();
    const dealSet = new Set<string>();
    const contactSet = new Set<string>();

    for (const contact of data.contacts) {
      contactSet.add(contact.id);
      contact.organizationIds?.forEach((id) => organizationSet.add(id));
      contact.userIds?.forEach((id) => userSet.add(id));
      contact.dealIds?.forEach((id) => dealSet.add(id));
    }

    const [validOrgIdsSet, validUserIdsSet, validDealIdsSet, validContactIdsSet, allColumns] =
      await preserveTenantContext(async () => {
        return await Promise.all([
          getOrganizationRepo().findIds(organizationSet),
          getCompanyRepo().findIds(userSet),
          getDealRepo().findIds(dealSet),
          getContactRepo().findIds(contactSet),
          getCustomColumnRepo().findByEntityType(EntityType.contact),
        ]);
      });

    for (let i = 0; i < data.contacts.length; i++) {
      const contact = data.contacts[i];
      validateContactIds(contact.id, validContactIdsSet, ctx, ["contacts", i, "id"]);
      validateOrganizationIds(contact.organizationIds, validOrgIdsSet, ctx, ["contacts", i, "organizationIds"]);
      validateUserIds(contact.userIds, validUserIdsSet, ctx, ["contacts", i, "userIds"]);
      validateDealIds(contact.dealIds, validDealIdsSet, ctx, ["contacts", i, "dealIds"]);
      validateCustomFieldValues(contact.customFieldValues, allColumns, ctx, ["contacts", i, "customFieldValues"]);
      contact.notes = validateNotes(contact.notes, ctx, ["contacts", i, "notes"]);
    }
  });
export type UpdateManyContactsData = Data<typeof UpdateManyContactsSchema>;
@TentantInteractor({
  resource: Resource.contacts,
  action: Action.update,
})
export class UpdateManyContactsInteractor extends BaseInteractor<UpdateManyContactsData, ContactDto[]> {
  constructor(
    private contactsRepo: UpdateContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(UpdateManyContactsSchema)
  @ValidateOutput(ContactDtoSchema)
  @Transaction
  async invoke(data: UpdateManyContactsData): Validated<ContactDto[]> {
    const previousContacts = await this.contactsRepo.getManyOrThrowUnscoped(data.contacts.map((c) => c.id));
    const previousContactsMap = new Map(previousContacts.map((c) => [c.id, c]));

    const relatedOrganizationIds = unique(
      previousContacts.flatMap((contact) => contact.organizations.map((it) => it.id)),
      data.contacts.flatMap((contactData) => contactData.organizationIds ?? []),
    );
    const relatedDealIds = unique(
      previousContacts.flatMap((contact) => contact.deals.map((it) => it.id)),
      data.contacts.flatMap((contactData) => contactData.dealIds ?? []),
    );

    const [previousOrganizations, previousDeals] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const contacts = await Promise.all(
      data.contacts.map((contactData) => this.contactsRepo.updateContactOrThrow(contactData)),
    );

    const [currentOrganizations, currentDeals] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    await Promise.all([
      ...buildRelationChangePublishes(
        previousOrganizations,
        currentOrganizations,
        "contacts",
        (organization, changes) =>
          this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
            entityId: organization.id,
            payload: {
              organization,
              changes,
            },
          }),
      ),
      ...buildRelationChangePublishes(previousDeals, currentDeals, "contacts", (deal, changes) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        }),
      ),
      ...contacts.map((contact) => {
        const previousContact = previousContactsMap.get(contact.id);
        const changes = previousContact ? calculateChanges(previousContact, contact) : {};

        return this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        });
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: contacts };
  }
}
