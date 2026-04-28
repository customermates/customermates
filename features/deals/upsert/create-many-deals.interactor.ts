import type { CreateDealRepo } from "./create-deal.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { validateTaskIds } from "../../../core/validation/validate-task-ids";
import { type DealDto, DealDtoSchema } from "../deal.schema";

import { BaseCreateDealSchema } from "./create-deal-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import {
  getCompanyRepo,
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

    const [validOrgIdsSet, validUserIdsSet, validContactIdsSet, validServiceIdsSet, validTaskIdsSet, allColumns] =
      await Promise.all([
        getOrganizationRepo().findIds(organizationSet),
        getCompanyRepo().findIds(userSet),
        getContactRepo().findIds(contactSet),
        getServiceRepo().findIds(serviceSet),
        getTaskRepo().findIds(taskSet),
        getCustomColumnRepo().findByEntityType(EntityType.deal),
      ]);

    for (let i = 0; i < data.deals.length; i++) {
      const deal = data.deals[i];
      validateOrganizationIds(deal.organizationIds, validOrgIdsSet, ctx, ["deals", i, "organizationIds"]);
      validateUserIds(deal.userIds, validUserIdsSet, ctx, ["deals", i, "userIds"]);
      validateContactIds(deal.contactIds, validContactIdsSet, ctx, ["deals", i, "contactIds"]);
      validateServiceIds(Array.from(serviceSet), validServiceIdsSet, ctx, ["deals", i, "services"]);
      validateTaskIds(deal.taskIds, validTaskIdsSet, ctx, ["deals", i, "taskIds"]);
      validateCustomFieldValues(deal.customFieldValues, allColumns, ctx, ["deals", i, "customFieldValues"]);
      deal.notes = validateNotes(deal.notes, ctx, ["deals", i, "notes"]);
    }
  });
export type CreateManyDealsData = Data<typeof CreateManyDealsSchema>;

@TentantInteractor({
  resource: Resource.deals,
  action: Action.create,
})
export class CreateManyDealsInteractor extends BaseInteractor<CreateManyDealsData, DealDto[]> {
  constructor(
    private repo: CreateDealRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(CreateManyDealsSchema)
  @ValidateOutput(DealDtoSchema)
  @Transaction
  async invoke(data: CreateManyDealsData): Validated<DealDto[]> {
    const relatedOrganizationIds = unique(data.deals.flatMap((deal) => deal.organizationIds));
    const relatedContactIds = unique(data.deals.flatMap((deal) => deal.contactIds));
    const relatedServiceIds = unique(data.deals.flatMap((deal) => deal.services.map((s) => s.serviceId)));
    const relatedTaskIds = unique(data.deals.flatMap((deal) => deal.taskIds));

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const deals = await Promise.all(data.deals.map((dealData) => this.repo.createDealOrThrow(dealData)));

    const [currentOrganizations, currentContacts, currentServices, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
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
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: deals };
  }
}
