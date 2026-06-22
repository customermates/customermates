import type { CreateDealRepo } from "./create-deal.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideServiceRepo } from "@/features/services/get-company-wide-service.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import {
  validateContactIds,
  validateOrganizationIds,
  validateUserIds,
  validateServiceIds,
  validateTaskIds,
} from "../../../core/validation/ids-validators";
import { validateAssigneeGuard } from "../../../core/validation/validate-assignee-guard";
import { type DealDto, DealDtoSchema } from "../deal.schema";

import { BaseCreateDealSchema } from "./create-deal-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BULK_WRITE_TRANSACTION, Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import {
  getUserRepo,
  getUserService,
  getContactRepo,
  getCustomColumnRepo,
  getOrganizationRepo,
  getServiceRepo,
  getTaskRepo,
} from "@/core/di";

export const CreateManyDealsSchema = z
  .object({
    deals: z.array(BaseCreateDealSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const organizationSet = new Set<string>();
    const userSet = new Set<string>();
    const contactSet = new Set<string>();
    const serviceSet = new Set<string>();
    const taskSet = new Set<string>();

    for (const deal of data.deals) {
      deal.organizationIds.forEach((id) => organizationSet.add(id));
      deal.userIds.forEach((id) => userSet.add(id));
      deal.contactIds.forEach((id) => contactSet.add(id));
      deal.services.forEach((s) => serviceSet.add(s.serviceId));
      deal.taskIds.forEach((id) => taskSet.add(id));
    }

    const [
      validOrgIdsSet,
      validUserIdsSet,
      validContactIdsSet,
      validServiceIdsSet,
      validTaskIdsSet,
      allColumns,
      currentUser,
      canReadAll,
    ] = await Promise.all([
      getOrganizationRepo().findIds(organizationSet),
      getUserRepo().findIds(userSet),
      getContactRepo().findIds(contactSet),
      getServiceRepo().findIds(serviceSet),
      getTaskRepo().findIds(taskSet),
      getCustomColumnRepo().findByEntityType(EntityType.deal),
      getUserService().getActiveUserOrThrow(),
      getUserService().hasPermission(Resource.deals, Action.readAll),
    ]);

    for (let i = 0; i < data.deals.length; i++) {
      const deal = data.deals[i];
      validateOrganizationIds(deal.organizationIds, validOrgIdsSet, ctx, ["deals", i, "organizationIds"]);
      validateUserIds(deal.userIds, validUserIdsSet, ctx, ["deals", i, "userIds"]);
      validateAssigneeGuard(deal.userIds, currentUser.id, canReadAll, ctx, ["deals", i, "userIds"]);
      validateContactIds(deal.contactIds, validContactIdsSet, ctx, ["deals", i, "contactIds"]);
      validateServiceIds(Array.from(serviceSet), validServiceIdsSet, ctx, ["deals", i, "services"]);
      validateTaskIds(deal.taskIds, validTaskIdsSet, ctx, ["deals", i, "taskIds"]);
      validateCustomFieldValues(deal.customFieldValues, allColumns, ctx, ["deals", i, "customFieldValues"]);
      deal.notes = validateNotes(deal.notes, ctx, ["deals", i, "notes"]);
    }
  });
export type CreateManyDealsData = Data<typeof CreateManyDealsSchema>;

@TenantInteractor({
  resource: Resource.deals,
  action: Action.create,
})
export class CreateManyDealsInteractor extends AuthenticatedInteractor<CreateManyDealsData, DealDto[]> {
  constructor(
    private repo: CreateDealRepo,
    private organizationsRepo: GetCompanyWideOrganizationRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private servicesRepo: GetCompanyWideServiceRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(CreateManyDealsSchema)
  @ValidateOutput(DealDtoSchema)
  @Transaction(BULK_WRITE_TRANSACTION)
  async invoke(data: CreateManyDealsData): Validated<DealDto[]> {
    const relatedOrganizationIds = unique(data.deals.flatMap((deal) => deal.organizationIds));
    const relatedContactIds = unique(data.deals.flatMap((deal) => deal.contactIds));
    const relatedServiceIds = unique(data.deals.flatMap((deal) => deal.services.map((s) => s.serviceId)));
    const relatedTaskIds = unique(data.deals.flatMap((deal) => deal.taskIds));

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const deals = await Promise.all(data.deals.map((dealData) => this.repo.createDealOrThrow(dealData)));

    const [currentOrganizations, currentContacts, currentServices, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
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
      ...currentTasks.map((task, index) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes: calculateChanges(previousTasks[index], task),
          },
        }),
      ),
      ...deals.map((deal) =>
        this.eventService.publish(DomainEvent.DEAL_CREATED, {
          entityId: deal.id,
          payload: deal,
        }),
      ),
    ]);

    return { ok: true as const, data: deals };
  }
}
