import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { FindContactsByIdsRepo } from "../../contacts/find-contacts-by-ids.repo";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { FindDealsByIdsRepo } from "../../deals/find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { FindOrganizationsByIdsRepo } from "../find-organizations-by-ids.repo";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { type OrganizationDto } from "../organization.schema";

import { BaseUpdateOrganizationSchema } from "./update-organization-base.schema";
import { UpdateOrganizationRepo } from "./update-organization.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";

export const UpdateOrganizationSchema = BaseUpdateOrganizationSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");

  const contactSet = new Set(data.contactIds ?? []);
  const userSet = new Set(data.userIds ?? []);
  const dealSet = new Set(data.dealIds ?? []);
  const organizationSet = new Set([data.id]);

  const [validContactIdsSet, validUserIdsSet, validDealIdsSet, validOrgIdsSet, allColumns] =
    await preserveTenantContext(() =>
      Promise.all([
        di.get(FindContactsByIdsRepo).findIds(contactSet),
        di.get(FindUsersByIdsRepo).findIds(userSet),
        di.get(FindDealsByIdsRepo).findIds(dealSet),
        di.get(FindOrganizationsByIdsRepo).findIds(organizationSet),
        di.get(FindCustomColumnRepo).findByEntityType(EntityType.organization),
      ]),
    );

  validateOrganizationIds(data.id, validOrgIdsSet, ctx, ["id"]);
  validateContactIds(data.contactIds, validContactIdsSet, ctx, ["contactIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateOrganizationData = Data<typeof UpdateOrganizationSchema>;

@TentantInteractor({
  resource: Resource.organizations,
  action: Action.update,
})
export class UpdateOrganizationInteractor {
  constructor(
    private organizationsRepo: UpdateOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(UpdateOrganizationSchema)
  @Transaction
  async invoke(data: UpdateOrganizationData): Validated<OrganizationDto, UpdateOrganizationData> {
    const previousOrganization = await this.organizationsRepo.getOrThrowUnscoped(data.id);

    const relatedContactIds = unique(
      previousOrganization.contacts.map((it) => it.id),
      data.contactIds,
    );
    const relatedDealIds = unique(
      previousOrganization.deals.map((it) => it.id),
      data.dealIds,
    );

    const [previousContacts, previousDeals] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const organization = await this.organizationsRepo.updateOrganizationOrThrow(data);

    const [currentContacts, currentDeals] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const changes = calculateChanges(previousOrganization, organization);

    await Promise.all([
      ...buildRelationChangePublishes(previousContacts, currentContacts, "organizations", (contact, changes) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousDeals, currentDeals, "organizations", (deal, changes) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        }),
      ),
      this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
        entityId: organization.id,
        payload: {
          organization,
          changes,
        },
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: organization };
  }
}
