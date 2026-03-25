import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { FindDealsByIdsRepo } from "../../deals/find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { FindOrganizationsByIdsRepo } from "../../organizations/find-organizations-by-ids.repo";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { FindContactsByIdsRepo } from "../find-contacts-by-ids.repo";
import { validateContactIds } from "../validate-contact-ids";
import { type ContactDto } from "../contact.schema";

import { UpdateContactRepo } from "./update-contact.repo";
import { BaseUpdateContactSchema } from "./update-contact-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";

export const UpdateContactSchema = BaseUpdateContactSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");

  const organizationSet = new Set(data.organizationIds ?? []);
  const userSet = new Set(data.userIds ?? []);
  const dealSet = new Set(data.dealIds ?? []);
  const contactSet = new Set([data.id]);

  const [validOrgIdsSet, validUserIdsSet, validDealIdsSet, validContactIdsSet, allColumns] =
    await preserveTenantContext(() =>
      Promise.all([
        di.get(FindOrganizationsByIdsRepo).findIds(organizationSet),
        di.get(FindUsersByIdsRepo).findIds(userSet),
        di.get(FindDealsByIdsRepo).findIds(dealSet),
        di.get(FindContactsByIdsRepo).findIds(contactSet),
        di.get(FindCustomColumnRepo).findByEntityType(EntityType.contact),
      ]),
    );

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
export class UpdateContactInteractor {
  constructor(
    private contactsRepo: UpdateContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(UpdateContactSchema)
  @Transaction
  async invoke(data: UpdateContactData): Validated<ContactDto, UpdateContactData> {
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

    return { ok: true, data: contact };
  }
}
