import { z } from "zod";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { FindDealsByIdsRepo } from "../../deals/find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { FindOrganizationsByIdsRepo } from "../../organizations/find-organizations-by-ids.repo";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { FindContactsByIdsRepo } from "../find-contacts-by-ids.repo";
import { validateContactIds } from "../validate-contact-ids";
import { type ContactDto } from "../contact.schema";

import { BaseUpdateContactSchema } from "./update-contact-base.schema";
import { UpdateContactRepo } from "./update-contact.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";

export const UpdateManyContactsSchema = z
  .object({
    contacts: z.array(BaseUpdateContactSchema).min(1).max(10),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");

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
          di.get(FindOrganizationsByIdsRepo).findIds(organizationSet),
          di.get(FindUsersByIdsRepo).findIds(userSet),
          di.get(FindDealsByIdsRepo).findIds(dealSet),
          di.get(FindContactsByIdsRepo).findIds(contactSet),
          di.get(FindCustomColumnRepo).findByEntityType(EntityType.contact),
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
export class UpdateManyContactsInteractor {
  constructor(
    private repo: UpdateContactRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(UpdateManyContactsSchema)
  @Transaction
  async invoke(data: UpdateManyContactsData): Validated<ContactDto[], UpdateManyContactsData> {
    const previousContacts = await Promise.all(data.contacts.map((c) => this.repo.getContactByIdOrThrow(c.id)));
    const contacts = await Promise.all(data.contacts.map((contactData) => this.repo.updateContactOrThrow(contactData)));

    const previousContactsMap = new Map(previousContacts.map((c) => [c.id, c]));

    await Promise.all([
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

    return { ok: true, data: contacts };
  }
}
