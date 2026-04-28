import type { CreateTaskRepo } from "./create-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { BaseCreateTaskSchema } from "./create-task-base.schema";

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
  getDealRepo,
  getOrganizationRepo,
  getServiceRepo,
} from "@/core/di";

export const CreateManyTasksSchema = z
  .object({
    tasks: z.array(BaseCreateTaskSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const userSet = new Set<string>();
    const contactSet = new Set<string>();
    const orgSet = new Set<string>();
    const dealSet = new Set<string>();
    const serviceSet = new Set<string>();

    for (const task of data.tasks) {
      task.userIds.forEach((id) => userSet.add(id));
      task.contactIds.forEach((id) => contactSet.add(id));
      task.organizationIds.forEach((id) => orgSet.add(id));
      task.dealIds.forEach((id) => dealSet.add(id));
      task.serviceIds.forEach((id) => serviceSet.add(id));
    }

    const [validUserIdsSet, validContactIdsSet, validOrgIdsSet, validDealIdsSet, validServiceIdsSet, allColumns] =
      await Promise.all([
        getCompanyRepo().findIds(userSet),
        getContactRepo().findIds(contactSet),
        getOrganizationRepo().findIds(orgSet),
        getDealRepo().findIds(dealSet),
        getServiceRepo().findIds(serviceSet),
        getCustomColumnRepo().findByEntityType(EntityType.task),
      ]);

    for (let i = 0; i < data.tasks.length; i++) {
      const task = data.tasks[i];
      validateUserIds(task.userIds, validUserIdsSet, ctx, ["tasks", i, "userIds"]);
      validateContactIds(task.contactIds, validContactIdsSet, ctx, ["tasks", i, "contactIds"]);
      validateOrganizationIds(task.organizationIds, validOrgIdsSet, ctx, ["tasks", i, "organizationIds"]);
      validateDealIds(task.dealIds, validDealIdsSet, ctx, ["tasks", i, "dealIds"]);
      validateServiceIds(task.serviceIds, validServiceIdsSet, ctx, ["tasks", i, "serviceIds"]);
      validateCustomFieldValues(task.customFieldValues, allColumns, ctx, ["tasks", i, "customFieldValues"]);
      task.notes = validateNotes(task.notes, ctx, ["tasks", i, "notes"]);
    }
  });
export type CreateManyTasksData = Data<typeof CreateManyTasksSchema>;

@TentantInteractor({
  resource: Resource.tasks,
  action: Action.create,
})
export class CreateManyTasksInteractor extends BaseInteractor<CreateManyTasksData, TaskDto[]> {
  constructor(
    private repo: CreateTaskRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(CreateManyTasksSchema)
  @ValidateOutput(TaskDtoSchema)
  @Transaction
  async invoke(data: CreateManyTasksData): Validated<TaskDto[]> {
    const relatedContactIds = unique(data.tasks.flatMap((task) => task.contactIds));
    const relatedOrganizationIds = unique(data.tasks.flatMap((task) => task.organizationIds));
    const relatedDealIds = unique(data.tasks.flatMap((task) => task.dealIds));
    const relatedServiceIds = unique(data.tasks.flatMap((task) => task.serviceIds));

    const [previousContacts, previousOrganizations, previousDeals, previousServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const tasks = await Promise.all(data.tasks.map((taskData) => this.repo.createTaskOrThrow(taskData)));

    const [currentContacts, currentOrganizations, currentDeals, currentServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
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
      ...currentOrganizations.map((organization, index) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes: calculateChanges(previousOrganizations[index], organization),
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
      ...currentServices.map((service, index) =>
        this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes: calculateChanges(previousServices[index], service),
          },
        }),
      ),
      ...tasks.map((task) =>
        this.eventService.publish(DomainEvent.TASK_CREATED, {
          entityId: task.id,
          payload: task,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: tasks };
  }
}
