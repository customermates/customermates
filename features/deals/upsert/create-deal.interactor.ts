import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { FindOrganizationsByIdsRepo } from "../../organizations/find-organizations-by-ids.repo";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { FindContactsByIdsRepo } from "../../contacts/find-contacts-by-ids.repo";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { FindServicesByIdsRepo } from "../../services/find-services-by-ids.repo";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { type DealDto } from "../deal.schema";

import { BaseCreateDealSchema } from "./create-deal-base.schema";
import { CreateDealRepo } from "./create-deal.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateDealSchema = BaseCreateDealSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");

  const organizationSet = new Set(data.organizationIds);
  const userSet = new Set(data.userIds);
  const contactSet = new Set(data.contactIds);
  const serviceSet = new Set(data.services.map((s) => s.serviceId));

  const [validOrgIdsSet, validUserIdsSet, validContactIdsSet, validServiceIdsSet, allColumns] =
    await preserveTenantContext(() =>
      Promise.all([
        di.get(FindOrganizationsByIdsRepo).findIds(organizationSet),
        di.get(FindUsersByIdsRepo).findIds(userSet),
        di.get(FindContactsByIdsRepo).findIds(contactSet),
        di.get(FindServicesByIdsRepo).findIds(serviceSet),
        di.get(FindCustomColumnRepo).findByEntityType(EntityType.deal),
      ]),
    );

  validateOrganizationIds(data.organizationIds, validOrgIdsSet, ctx, ["organizationIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateContactIds(data.contactIds, validContactIdsSet, ctx, ["contactIds"]);
  validateServiceIds(Array.from(serviceSet), validServiceIdsSet, ctx, ["services"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateDealData = Data<typeof CreateDealSchema>;

@TentantInteractor({
  resource: Resource.deals,
  action: Action.create,
})
export class CreateDealInteractor {
  constructor(
    private repo: CreateDealRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(CreateDealSchema)
  async invoke(data: CreateDealData): Validated<DealDto, CreateDealData> {
    const relatedOrganizationIds = unique(data.organizationIds);
    const relatedContactIds = unique(data.contactIds);
    const relatedServiceIds = unique(data.services.map((s) => s.serviceId));

    const [previousOrganizations, previousContacts, previousServices] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const deal = await this.repo.createDealOrThrow(data);

    const [currentOrganizations, currentContacts, currentServices] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
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
      ...currentContacts.map((contact, index) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes: calculateChanges(previousContacts[index], contact),
          },
        }),
      ),
      ...currentServices.map((service, index) =>
        this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes: calculateChanges(previousServices[index], service),
          },
        }),
      ),
      this.eventService.publish(DomainEvent.DEAL_CREATED, {
        entityId: deal.id,
        payload: deal,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: deal };
  }
}
