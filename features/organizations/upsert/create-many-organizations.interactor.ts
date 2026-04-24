import type { CreateOrganizationRepo } from "./create-organization.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { type OrganizationDto, OrganizationDtoSchema } from "../organization.schema";

import { BaseCreateOrganizationSchema } from "./create-organization-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getContactRepo, getCustomColumnRepo, getDealRepo } from "@/core/di";

export const CreateManyOrganizationsSchema = z
  .object({
    organizations: z.array(BaseCreateOrganizationSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const contactSet = new Set<string>();
    const userSet = new Set<string>();
    const dealSet = new Set<string>();

    for (const organization of data.organizations) {
      organization.contactIds.forEach((id) => contactSet.add(id));
      organization.userIds.forEach((id) => userSet.add(id));
      organization.dealIds.forEach((id) => dealSet.add(id));
    }

    const [validContactIdsSet, validUserIdsSet, validDealIdsSet, allColumns] = await Promise.all([
      getContactRepo().findIds(contactSet),
      getCompanyRepo().findIds(userSet),
      getDealRepo().findIds(dealSet),
      getCustomColumnRepo().findByEntityType(EntityType.organization),
    ]);

    for (let i = 0; i < data.organizations.length; i++) {
      const organization = data.organizations[i];
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
export type CreateManyOrganizationsData = Data<typeof CreateManyOrganizationsSchema>;

@TentantInteractor({
  resource: Resource.organizations,
  action: Action.create,
})
export class CreateManyOrganizationsInteractor extends BaseInteractor<CreateManyOrganizationsData, OrganizationDto[]> {
  constructor(
    private repo: CreateOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(CreateManyOrganizationsSchema)
  @ValidateOutput(OrganizationDtoSchema)
  @Transaction
  async invoke(data: CreateManyOrganizationsData): Validated<OrganizationDto[]> {
    const relatedContactIds = unique(data.organizations.flatMap((organization) => organization.contactIds));
    const relatedDealIds = unique(data.organizations.flatMap((organization) => organization.dealIds));

    const [previousContacts, previousDeals] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    const organizations = await Promise.all(
      data.organizations.map((organizationData) => this.repo.createOrganizationOrThrow(organizationData)),
    );

    const [currentContacts, currentDeals] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
    ]);

    await Promise.all([
      ...currentContacts.map((contact, index) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes: calculateChanges(previousContacts[index], contact),
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
      ...organizations.map((organization) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_CREATED, {
          entityId: organization.id,
          payload: organization,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: organizations };
  }
}
