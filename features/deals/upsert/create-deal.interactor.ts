import type { CreateDealRepo } from "./create-deal.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideServiceRepo } from "@/features/services/get-company-wide-service.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
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
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
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

export const CreateDealSchema = BaseCreateDealSchema.superRefine(async (data, ctx) => {
  const organizationSet = new Set(data.organizationIds);
  const userSet = new Set(data.userIds);
  const contactSet = new Set(data.contactIds);
  const serviceSet = new Set(data.services.map((s) => s.serviceId));
  const taskSet = new Set(data.taskIds);

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

  validateOrganizationIds(data.organizationIds, validOrgIdsSet, ctx, ["organizationIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateAssigneeGuard(data.userIds, currentUser.id, canReadAll, ctx, ["userIds"]);
  validateContactIds(data.contactIds, validContactIdsSet, ctx, ["contactIds"]);
  validateServiceIds(Array.from(serviceSet), validServiceIdsSet, ctx, ["services"]);
  validateTaskIds(data.taskIds, validTaskIdsSet, ctx, ["taskIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateDealData = Data<typeof CreateDealSchema>;

@TenantInteractor({
  resource: Resource.deals,
  action: Action.create,
})
export class CreateDealInteractor extends AuthenticatedInteractor<CreateDealData, DealDto> {
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

  @Validate(CreateDealSchema)
  @ValidateOutput(DealDtoSchema)
  @Transaction
  async invoke(data: CreateDealData): Validated<DealDto> {
    const relatedOrganizationIds = unique(data.organizationIds);
    const relatedContactIds = unique(data.contactIds);
    const relatedServiceIds = unique(data.services.map((s) => s.serviceId));
    const relatedTaskIds = unique(data.taskIds);

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const deal = await this.repo.createDealOrThrow(data);

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
      this.eventService.publish(DomainEvent.DEAL_CREATED, {
        entityId: deal.id,
        payload: deal,
      }),
    ]);

    return { ok: true as const, data: deal };
  }
}
