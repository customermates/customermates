import type { UpdateDealRepo } from "./update-deal.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateTaskIds } from "../../../core/validation/validate-task-ids";
import { type DealDto, DealDtoSchema } from "../deal.schema";

import { BaseUpdateDealSchema } from "./update-deal-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { unique } from "@/core/utils/unique";
import {
  getCompanyRepo,
  getContactRepo,
  getCustomColumnRepo,
  getDealRepo,
  getOrganizationRepo,
  getServiceRepo,
  getTaskRepo,
} from "@/core/app-di";

export const UpdateManyDealsSchema = z
  .object({
    deals: z.array(BaseUpdateDealSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const organizationSet = new Set<string>();
    const userSet = new Set<string>();
    const contactSet = new Set<string>();
    const serviceSet = new Set<string>();
    const dealSet = new Set<string>();
    const taskSet = new Set<string>();

    for (const deal of data.deals) {
      dealSet.add(deal.id);
      deal.organizationIds?.forEach((id) => organizationSet.add(id));
      deal.userIds?.forEach((id) => userSet.add(id));
      deal.contactIds?.forEach((id) => contactSet.add(id));
      deal.services?.forEach((s) => serviceSet.add(s.serviceId));
      deal.taskIds?.forEach((id) => taskSet.add(id));
    }

    const [
      validOrgIdsSet,
      validUserIdsSet,
      validContactIdsSet,
      validServiceIdsSet,
      validDealIdsSet,
      validTaskIdsSet,
      allColumns,
    ] = await Promise.all([
      getOrganizationRepo().findIds(organizationSet),
      getCompanyRepo().findIds(userSet),
      getContactRepo().findIds(contactSet),
      getServiceRepo().findIds(serviceSet),
      getDealRepo().findIds(dealSet),
      getTaskRepo().findIds(taskSet),
      getCustomColumnRepo().findByEntityType(EntityType.deal),
    ]);

    for (let i = 0; i < data.deals.length; i++) {
      const deal = data.deals[i];
      validateDealIds(deal.id, validDealIdsSet, ctx, ["deals", i, "id"]);
      validateOrganizationIds(deal.organizationIds, validOrgIdsSet, ctx, ["deals", i, "organizationIds"]);
      validateUserIds(deal.userIds, validUserIdsSet, ctx, ["deals", i, "userIds"]);
      validateContactIds(deal.contactIds, validContactIdsSet, ctx, ["deals", i, "contactIds"]);
      validateServiceIds(Array.from(serviceSet), validServiceIdsSet, ctx, ["deals", i, "services"]);
      validateTaskIds(deal.taskIds, validTaskIdsSet, ctx, ["deals", i, "taskIds"]);
      validateCustomFieldValues(deal.customFieldValues, allColumns, ctx, ["deals", i, "customFieldValues"]);
      deal.notes = validateNotes(deal.notes, ctx, ["deals", i, "notes"]);
    }
  });
export type UpdateManyDealsData = Data<typeof UpdateManyDealsSchema>;
@TenantInteractor({
  resource: Resource.deals,
  action: Action.update,
})
export class UpdateManyDealsInteractor extends AuthenticatedInteractor<UpdateManyDealsData, DealDto[]> {
  constructor(
    private dealsRepo: UpdateDealRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpdateManyDealsSchema)
  @ValidateOutput(DealDtoSchema)
  @Transaction
  async invoke(data: UpdateManyDealsData): Validated<DealDto[]> {
    const previousDeals = await this.dealsRepo.getManyOrThrowUnscoped(data.deals.map((d) => d.id));
    const previousDealsMap = new Map(previousDeals.map((d) => [d.id, d]));

    const relatedOrganizationIds = unique(
      previousDeals.flatMap((deal) => deal.organizations.map((it) => it.id)),
      data.deals.flatMap((dealData) => dealData.organizationIds ?? []),
    );
    const relatedContactIds = unique(
      previousDeals.flatMap((deal) => deal.contacts.map((it) => it.id)),
      data.deals.flatMap((dealData) => dealData.contactIds ?? []),
    );
    const relatedServiceIds = unique(
      previousDeals.flatMap((deal) => deal.services.map((it) => it.id)),
      data.deals.flatMap((dealData) => dealData.services?.map((s) => s.serviceId) ?? []),
    );
    const relatedTaskIds = unique(
      previousDeals.flatMap((deal) => deal.tasks.map((it) => it.id)),
      data.deals.flatMap((dealData) => dealData.taskIds ?? []),
    );

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const deals = await Promise.all(data.deals.map((dealData) => this.dealsRepo.updateDealOrThrow(dealData)));

    const [currentOrganizations, currentContacts, currentServices, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

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
      ...buildRelationChangePublishes(previousTasks, currentTasks, "deals", (task, changes) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes,
          },
        }),
      ),
      ...deals.map((deal) => {
        const previousDeal = previousDealsMap.get(deal.id);
        const changes = previousDeal ? calculateChanges(previousDeal, deal) : {};

        return this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        });
      }),
    ]);

    return { ok: true as const, data: deals };
  }
}
