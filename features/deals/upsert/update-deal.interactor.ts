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
import { FindDealsByIdsRepo } from "../find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { type DealDto } from "../deal.schema";

import { BaseUpdateDealSchema } from "./update-deal-base.schema";
import { UpdateDealRepo } from "./update-deal.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";

export const UpdateDealSchema = BaseUpdateDealSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");

  const organizationSet = new Set(data.organizationIds ?? []);
  const userSet = new Set(data.userIds ?? []);
  const contactSet = new Set(data.contactIds ?? []);
  const services = data.services?.map((s) => s.serviceId);
  const serviceSet = new Set(services ?? []);
  const dealSet = new Set([data.id]);

  const [validOrgIdsSet, validUserIdsSet, validContactIdsSet, validServiceIdsSet, validDealIdsSet, allColumns] =
    await preserveTenantContext(() =>
      Promise.all([
        di.get(FindOrganizationsByIdsRepo).findIds(organizationSet),
        di.get(FindUsersByIdsRepo).findIds(userSet),
        di.get(FindContactsByIdsRepo).findIds(contactSet),
        di.get(FindServicesByIdsRepo).findIds(serviceSet),
        di.get(FindDealsByIdsRepo).findIds(dealSet),
        di.get(FindCustomColumnRepo).findByEntityType(EntityType.deal),
      ]),
    );

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
export class UpdateDealInteractor {
  constructor(
    private dealsRepo: UpdateDealRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(UpdateDealSchema)
  @Transaction
  async invoke(data: UpdateDealData): Validated<DealDto, UpdateDealData> {
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

    return { ok: true, data: deal };
  }
}
