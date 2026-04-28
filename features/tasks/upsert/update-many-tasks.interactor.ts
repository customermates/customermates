import type { UpdateTaskRepo } from "./update-task.repo";
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
import { validateTaskIds } from "../../../core/validation/validate-task-ids";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { BaseUpdateTaskSchema } from "./update-task-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { unique } from "@/core/utils/unique";
import {
  getCompanyRepo,
  getContactRepo,
  getCustomColumnRepo,
  getDealRepo,
  getOrganizationRepo,
  getServiceRepo,
  getTaskRepo,
} from "@/core/di";

export const UpdateManyTasksSchema = z
  .object({
    tasks: z.array(BaseUpdateTaskSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const userSet = new Set<string>();
    const taskSet = new Set<string>();
    const contactSet = new Set<string>();
    const orgSet = new Set<string>();
    const dealSet = new Set<string>();
    const serviceSet = new Set<string>();

    for (const task of data.tasks) {
      taskSet.add(task.id);
      task.userIds?.forEach((id) => userSet.add(id));
      task.contactIds?.forEach((id) => contactSet.add(id));
      task.organizationIds?.forEach((id) => orgSet.add(id));
      task.dealIds?.forEach((id) => dealSet.add(id));
      task.serviceIds?.forEach((id) => serviceSet.add(id));
    }

    const [
      validUserIdsSet,
      validTaskIdsSet,
      validContactIdsSet,
      validOrgIdsSet,
      validDealIdsSet,
      validServiceIdsSet,
      allColumns,
    ] = await Promise.all([
      getCompanyRepo().findIds(userSet),
      getTaskRepo().findIds(taskSet),
      getContactRepo().findIds(contactSet),
      getOrganizationRepo().findIds(orgSet),
      getDealRepo().findIds(dealSet),
      getServiceRepo().findIds(serviceSet),
      getCustomColumnRepo().findByEntityType(EntityType.task),
    ]);

    for (let i = 0; i < data.tasks.length; i++) {
      const task = data.tasks[i];
      validateTaskIds(task.id, validTaskIdsSet, ctx, ["tasks", i, "id"]);
      validateUserIds(task.userIds, validUserIdsSet, ctx, ["tasks", i, "userIds"]);
      validateContactIds(task.contactIds, validContactIdsSet, ctx, ["tasks", i, "contactIds"]);
      validateOrganizationIds(task.organizationIds, validOrgIdsSet, ctx, ["tasks", i, "organizationIds"]);
      validateDealIds(task.dealIds, validDealIdsSet, ctx, ["tasks", i, "dealIds"]);
      validateServiceIds(task.serviceIds, validServiceIdsSet, ctx, ["tasks", i, "serviceIds"]);
      validateCustomFieldValues(task.customFieldValues, allColumns, ctx, ["tasks", i, "customFieldValues"]);
      task.notes = validateNotes(task.notes, ctx, ["tasks", i, "notes"]);
    }
  });
export type UpdateManyTasksData = Data<typeof UpdateManyTasksSchema>;

@TentantInteractor({
  resource: Resource.tasks,
  action: Action.update,
})
export class UpdateManyTasksInteractor extends BaseInteractor<UpdateManyTasksData, TaskDto[]> {
  constructor(
    private repo: UpdateTaskRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(UpdateManyTasksSchema)
  @ValidateOutput(TaskDtoSchema)
  @Transaction
  async invoke(data: UpdateManyTasksData): Validated<TaskDto[]> {
    const previousTasks = await Promise.all(data.tasks.map((t) => this.repo.getTaskByIdOrThrow(t.id)));

    const relatedContactIds = unique(
      previousTasks.flatMap((t) => t.contacts.map((it) => it.id)),
      data.tasks.flatMap((t) => t.contactIds ?? []),
    );
    const relatedOrganizationIds = unique(
      previousTasks.flatMap((t) => t.organizations.map((it) => it.id)),
      data.tasks.flatMap((t) => t.organizationIds ?? []),
    );
    const relatedDealIds = unique(
      previousTasks.flatMap((t) => t.deals.map((it) => it.id)),
      data.tasks.flatMap((t) => t.dealIds ?? []),
    );
    const relatedServiceIds = unique(
      previousTasks.flatMap((t) => t.services.map((it) => it.id)),
      data.tasks.flatMap((t) => t.serviceIds ?? []),
    );

    const [previousContacts, previousOrganizations, previousDeals, previousServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const tasks = await Promise.all(data.tasks.map((taskData) => this.repo.updateTaskOrThrow(taskData)));

    const [currentContacts, currentOrganizations, currentDeals, currentServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const previousTasksMap = new Map(previousTasks.map((t) => [t.id, t]));

    await Promise.all([
      ...buildRelationChangePublishes(previousContacts, currentContacts, "tasks", (contact, changes) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousOrganizations, currentOrganizations, "tasks", (organization, changes) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousDeals, currentDeals, "tasks", (deal, changes) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousServices, currentServices, "tasks", (service, changes) =>
        this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes,
          },
        }),
      ),
      ...tasks.map((task) => {
        const previousTask = previousTasksMap.get(task.id);
        const changes = previousTask ? calculateChanges(previousTask, task) : {};

        return this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes,
          },
        });
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: tasks };
  }
}
