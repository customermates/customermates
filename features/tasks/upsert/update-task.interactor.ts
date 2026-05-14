import type { UpdateTaskRepo } from "./update-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateTaskIds } from "../../../core/validation/validate-task-ids";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
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
  getCompanyRepo,
  getContactRepo,
  getCustomColumnRepo,
  getDealRepo,
  getOrganizationRepo,
  getServiceRepo,
  getTaskRepo,
} from "@/core/app-di";

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

  validateTaskIds(data.id, validTaskIdsSet, ctx, ["id"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
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
    private contactsRepo: GetUnscopedContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpdateTaskSchema)
  @ValidateOutput(TaskDtoSchema)
  @Transaction
  async invoke(data: UpdateTaskData): Validated<TaskDto> {
    const previousTask = await this.repo.getOrThrowUnscoped(data.id);

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
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const task = await this.repo.updateTaskOrThrow(data);

    const [currentContacts, currentOrganizations, currentDeals, currentServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
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
