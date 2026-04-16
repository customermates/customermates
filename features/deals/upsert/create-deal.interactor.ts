import type { CreateDealRepo } from "./create-deal.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { type DealDto, DealDtoSchema } from "../deal.schema";

import { BaseCreateDealSchema } from "./create-deal-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getContactRepo, getCustomColumnRepo, getOrganizationRepo, getServiceRepo } from "@/core/di";

export const CreateDealSchema = BaseCreateDealSchema.superRefine(async (data, ctx) => {
  const organizationSet = new Set(data.organizationIds);
  const userSet = new Set(data.userIds);
  const contactSet = new Set(data.contactIds);
  const serviceSet = new Set(data.services.map((s) => s.serviceId));

  const [validOrgIdsSet, validUserIdsSet, validContactIdsSet, validServiceIdsSet, allColumns] =
    await preserveTenantContext(() =>
      Promise.all([
        getOrganizationRepo().findIds(organizationSet),
        getCompanyRepo().findIds(userSet),
        getContactRepo().findIds(contactSet),
        getServiceRepo().findIds(serviceSet),
        getCustomColumnRepo().findByEntityType(EntityType.deal),
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
export class CreateDealInteractor extends BaseInteractor<CreateDealData, DealDto> {
  constructor(
    private repo: CreateDealRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(CreateDealSchema)
  @ValidateOutput(DealDtoSchema)
  async invoke(data: CreateDealData): Validated<DealDto> {
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

    return { ok: true as const, data: deal };
  }
}
