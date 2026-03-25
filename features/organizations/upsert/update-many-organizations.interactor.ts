import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
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
import { unique } from "@/core/utils/unique";

export const UpdateManyOrganizationsSchema = z
  .object({
    organizations: z.array(BaseUpdateOrganizationSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");

    const contactSet = new Set<string>();
    const userSet = new Set<string>();
    const dealSet = new Set<string>();
    const organizationSet = new Set<string>();

    for (const organization of data.organizations) {
      organizationSet.add(organization.id);
      organization.contactIds?.forEach((id) => contactSet.add(id));
      organization.userIds?.forEach((id) => userSet.add(id));
      organization.dealIds?.forEach((id) => dealSet.add(id));
    }

    const [validContactIdsSet, validUserIdsSet, validDealIdsSet, validOrgIdsSet, allColumns] =
      await preserveTenantContext(async () => {
        return await Promise.all([
          di.get(FindContactsByIdsRepo).findIds(contactSet),
          di.get(FindUsersByIdsRepo).findIds(userSet),
          di.get(FindDealsByIdsRepo).findIds(dealSet),
          di.get(FindOrganizationsByIdsRepo).findIds(organizationSet),
          di.get(FindCustomColumnRepo).findByEntityType(EntityType.organization),
        ]);
      });

    for (let i = 0; i < data.organizations.length; i++) {
      const organization = data.organizations[i];
      validateOrganizationIds(organization.id, validOrgIdsSet, ctx, ["organizations", i, "id"]);
      validateContactIds(organization.contactIds, validContactIdsSet, ctx, ["organizations", i, "contactIds"]);
      validateUserIds(organization.userIds, validUserIdsSet, ctx, ["organizations", i, "userIds"]);
      validateDealIds(organization.dealIds, validDealIdsSet, ctx, ["organizations", i, "dealIds"]);
      validateCustomFieldValues(organization.customFieldValues, allColumns, ctx, [
        "organizations",
        i,
        "customFieldValues",
      ]);
      organization.notes = validateNotes(organization.notes, ctx, ["organizations", i, "notes"]);
    }
  });
export type UpdateManyOrganizationsData = Data<typeof UpdateManyOrganizationsSchema>;

@TentantInteractor({
  resource: Resource.organizations,
  action: Action.update,
})
export class UpdateManyOrganizationsInteractor {
  constructor(
    private organizationsRepo: UpdateOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(UpdateManyOrganizationsSchema)
  @Transaction
  async invoke(data: UpdateManyOrganizationsData): Validated<OrganizationDto[], UpdateManyOrganizationsData> {
    const previousOrganizations = await this.organizationsRepo.getManyOrThrowUnscoped(
      data.organizations.map((o) => o.id),
    );
    const previousOrganizationsMap = new Map(previousOrganizations.map((o) => [o.id, o]));

    const relatedContactIds = unique(
      previousOrganizations.flatMap((organization) => organization.contacts.map((it) => it.id)),
      data.organizations.flatMap((organizationData) => organizationData.contactIds ?? []),
    );
    const relatedDealIds = unique(
      previousOrganizations.flatMap((organization) => organization.deals.map((it) => it.id)),
      data.organizations.flatMap((organizationData) => organizationData.dealIds ?? []),
    );

    const [previousContacts, previousDeals] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const organizations = await Promise.all(
      data.organizations.map((organizationData) => this.organizationsRepo.updateOrganizationOrThrow(organizationData)),
    );

    const [currentContacts, currentDeals] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

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
      ...organizations.map((organization) => {
        const previousOrganization = previousOrganizationsMap.get(organization.id);
        const changes = previousOrganization ? calculateChanges(previousOrganization, organization) : {};

        return this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes,
          },
        });
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: organizations };
  }
}
