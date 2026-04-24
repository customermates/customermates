import type { UpdateDealRepo } from "./update-deal.repo";
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
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { type DealDto, DealDtoSchema } from "../deal.schema";

import { BaseUpdateDealSchema } from "./update-deal-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";
import {
  getCompanyRepo,
  getContactRepo,
  getCustomColumnRepo,
  getDealRepo,
  getOrganizationRepo,
  getServiceRepo,
} from "@/core/di";

export const UpdateDealSchema = BaseUpdateDealSchema.superRefine(async (data, ctx) => {
  const organizationSet = new Set(data.organizationIds ?? []);
  const userSet = new Set(data.userIds ?? []);
  const contactSet = new Set(data.contactIds ?? []);
  const services = data.services?.map((s) => s.serviceId);
  const serviceSet = new Set(services ?? []);
  const dealSet = new Set([data.id]);

  const [validOrgIdsSet, validUserIdsSet, validContactIdsSet, validServiceIdsSet, validDealIdsSet, allColumns] =
    await Promise.all([
      getOrganizationRepo().findIds(organizationSet),
      getCompanyRepo().findIds(userSet),
      getContactRepo().findIds(contactSet),
      getServiceRepo().findIds(serviceSet),
      getDealRepo().findIds(dealSet),
      getCustomColumnRepo().findByEntityType(EntityType.deal),
    ]);

  validateDealIds(data.id, validDealIdsSet, ctx, ["id"]);
  validateOrganizationIds(data.organizationIds, validOrgIdsSet, ctx, ["organizationIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateContactIds(data.contactIds, validContactIdsSet, ctx, ["contactIds"]);
  validateServiceIds(services, validServiceIdsSet, ctx, ["services"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateDealData = Data<typeof UpdateDealSchema>;

@TentantInteractor({
  resource: Resource.deals,
  action: Action.update,
})
export class UpdateDealInteractor extends BaseInteractor<UpdateDealData, DealDto> {
  constructor(
    private dealsRepo: UpdateDealRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(UpdateDealSchema)
  @ValidateOutput(DealDtoSchema)
  @Transaction
  async invoke(data: UpdateDealData): Validated<DealDto> {
    const previousDeal = await this.dealsRepo.getOrThrowUnscoped(data.id);

    const relatedOrganizationIds = unique(
      previousDeal.organizations.map((it) => it.id),
      data.organizationIds,
    );
    const relatedContactIds = unique(
      previousDeal.contacts.map((it) => it.id),
      data.contactIds,
    );
    const relatedServiceIds = unique(
      previousDeal.services.map((it) => it.id),
      data.services?.map((s) => s.serviceId),
    );

    const [previousOrganizations, previousContacts, previousServices] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const deal = await this.dealsRepo.updateDealOrThrow(data);

    const [currentOrganizations, currentContacts, currentServices] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const changes = calculateChanges(previousDeal, deal);

    await Promise.all([
      ...buildRelationChangePublishes(previousOrganizations, currentOrganizations, "deals", (organization, changes) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousContacts, currentContacts, "deals", (contact, changes) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousServices, currentServices, "deals", (service, changes) =>
        this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes,
          },
        }),
      ),
      this.eventService.publish(DomainEvent.DEAL_UPDATED, {
        entityId: deal.id,
        payload: {
          deal,
          changes,
        },
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: deal };
  }
}
