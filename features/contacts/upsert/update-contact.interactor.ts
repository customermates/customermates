import type { UpdateContactRepo } from "./update-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
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
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getContactRepo, getCustomColumnRepo, getDealRepo, getOrganizationRepo } from "@/core/di";

export const UpdateContactSchema = BaseUpdateContactSchema.superRefine(async (data, ctx) => {
  const organizationSet = new Set(data.organizationIds ?? []);
  const userSet = new Set(data.userIds ?? []);
  const dealSet = new Set(data.dealIds ?? []);
  const contactSet = new Set([data.id]);

  const [validOrgIdsSet, validUserIdsSet, validDealIdsSet, validContactIdsSet, allColumns] = await Promise.all([
    getOrganizationRepo().findIds(organizationSet),
    getCompanyRepo().findIds(userSet),
    getDealRepo().findIds(dealSet),
    getContactRepo().findIds(contactSet),
    getCustomColumnRepo().findByEntityType(EntityType.contact),
  ]);

  validateContactIds(data.id, validContactIdsSet, ctx, ["id"]);
  validateOrganizationIds(data.organizationIds, validOrgIdsSet, ctx, ["organizationIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateContactData = Data<typeof UpdateContactSchema>;

@TentantInteractor({
  resource: Resource.contacts,
  action: Action.update,
})
export class UpdateContactInteractor extends BaseInteractor<UpdateContactData, ContactDto> {
  constructor(
    private contactsRepo: UpdateContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(UpdateContactSchema)
  @ValidateOutput(ContactDtoSchema)
  @Transaction
  async invoke(data: UpdateContactData): Validated<ContactDto> {
    const previousContact = await this.contactsRepo.getOrThrowUnscoped(data.id);

    const relatedOrganizationIds = unique(
      previousContact.organizations.map((it) => it.id),
      data.organizationIds,
    );
    const relatedDealIds = unique(
      previousContact.deals.map((it) => it.id),
      data.dealIds,
    );

    const [previousOrganizations, previousDeals] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const contact = await this.contactsRepo.updateContactOrThrow(data);

    const [currentOrganizations, currentDeals] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const changes = calculateChanges(previousContact, contact);

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
      this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: contact.id,
        payload: {
          contact,
          changes,
        },
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: contact };
  }
}
