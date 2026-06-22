import type { UpdateTaskRepo } from "./update-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideServiceRepo } from "@/features/services/get-company-wide-service.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import {
  validateContactIds,
  validateUserIds,
  validateSystemTaskName,
  validateTaskIds,
  validateOrganizationIds,
  validateDealIds,
  validateServiceIds,
} from "../../../core/validation/ids-validators";
import { validateAssigneeGuard } from "../../../core/validation/validate-assignee-guard";
import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { BaseUpdateTaskSchema } from "./update-task-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import {
  getUserRepo,
  getUserService,
  getContactRepo,
  getCustomColumnRepo,
  getDealRepo,
  getOrganizationRepo,
  getServiceRepo,
  getTaskRepo,
} from "@/core/di";

export const UpdateTaskSchema = BaseUpdateTaskSchema.superRefine(async (data, ctx) => {
  const userSet = new Set(data.userIds ?? []);
  const taskSet = new Set([data.id]);
  const contactSet = new Set(data.contactIds ?? []);
  const orgSet = new Set(data.organizationIds ?? []);
  const dealSet = new Set(data.dealIds ?? []);
  const serviceSet = new Set(data.serviceIds ?? []);

  const [
    validUserIdsSet,
    validTaskIdsSet,
    systemTaskIdsSet,
    validContactIdsSet,
    validOrgIdsSet,
    validDealIdsSet,
    validServiceIdsSet,
    allColumns,
    currentUser,
    canReadAll,
  ] = await Promise.all([
    getUserRepo().findIds(userSet),
    getTaskRepo().findIds(taskSet),
    getTaskRepo().findSystemTaskIds(taskSet),
    getContactRepo().findIds(contactSet),
    getOrganizationRepo().findIds(orgSet),
    getDealRepo().findIds(dealSet),
    getServiceRepo().findIds(serviceSet),
    getCustomColumnRepo().findByEntityType(EntityType.task),
    getUserService().getActiveUserOrThrow(),
    getUserService().hasPermission(Resource.tasks, Action.readAll),
  ]);

  validateTaskIds(data.id, validTaskIdsSet, ctx, ["id"]);
  validateSystemTaskName(data, systemTaskIdsSet, ctx, []);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateAssigneeGuard(data.userIds, currentUser.id, canReadAll, ctx, ["userIds"]);
  validateContactIds(data.contactIds, validContactIdsSet, ctx, ["contactIds"]);
  validateOrganizationIds(data.organizationIds, validOrgIdsSet, ctx, ["organizationIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateServiceIds(data.serviceIds, validServiceIdsSet, ctx, ["serviceIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateTaskData = Data<typeof UpdateTaskSchema>;

@TenantInteractor({
  resource: Resource.tasks,
  action: Action.update,
})
export class UpdateTaskInteractor extends AuthenticatedInteractor<UpdateTaskData, TaskDto> {
  constructor(
    private repo: UpdateTaskRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private organizationsRepo: GetCompanyWideOrganizationRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private servicesRepo: GetCompanyWideServiceRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpdateTaskSchema)
  @ValidateOutput(TaskDtoSchema)
  @Transaction
  async invoke(data: UpdateTaskData): Validated<TaskDto> {
    const previousTask = await this.repo.getOrThrowCompanyWide(data.id);

    const relatedContactIds = unique(
      previousTask.contacts.map((it) => it.id),
      data.contactIds,
    );
    const relatedOrganizationIds = unique(
      previousTask.organizations.map((it) => it.id),
      data.organizationIds,
    );
    const relatedDealIds = unique(
      previousTask.deals.map((it) => it.id),
      data.dealIds,
    );
    const relatedServiceIds = unique(
      previousTask.services.map((it) => it.id),
      data.serviceIds,
    );

    const [previousContacts, previousOrganizations, previousDeals, previousServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
    ]);

    const task = await this.repo.updateTaskOrThrow(data);

    const [currentContacts, currentOrganizations, currentDeals, currentServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
    ]);

    const changes = calculateChanges(previousTask, task);

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
      this.eventService.publish(DomainEvent.TASK_UPDATED, {
        entityId: task.id,
        payload: {
          task,
          changes,
        },
      }),
    ]);

    return { ok: true as const, data: task };
  }
}
