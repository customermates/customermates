import type { CreateTaskRepo } from "./create-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { BaseCreateTaskSchema } from "./create-task-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { validateNotes } from "@/core/validation/validate-notes";
import {
  getCompanyRepo,
  getContactRepo,
  getCustomColumnRepo,
  getDealRepo,
  getOrganizationRepo,
  getServiceRepo,
} from "@/core/app-di";

export const CreateTaskSchema = BaseCreateTaskSchema.superRefine(async (data, ctx) => {
  const userSet = new Set(data.userIds);
  const contactSet = new Set(data.contactIds);
  const orgSet = new Set(data.organizationIds);
  const dealSet = new Set(data.dealIds);
  const serviceSet = new Set(data.serviceIds);

  const [validUserIdsSet, validContactIdsSet, validOrgIdsSet, validDealIdsSet, validServiceIdsSet, allColumns] =
    await Promise.all([
      getCompanyRepo().findIds(userSet),
      getContactRepo().findIds(contactSet),
      getOrganizationRepo().findIds(orgSet),
      getDealRepo().findIds(dealSet),
      getServiceRepo().findIds(serviceSet),
      getCustomColumnRepo().findByEntityType(EntityType.task),
    ]);

  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateContactIds(data.contactIds, validContactIdsSet, ctx, ["contactIds"]);
  validateOrganizationIds(data.organizationIds, validOrgIdsSet, ctx, ["organizationIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateServiceIds(data.serviceIds, validServiceIdsSet, ctx, ["serviceIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateTaskData = Data<typeof CreateTaskSchema>;

@TenantInteractor({
  resource: Resource.tasks,
  action: Action.create,
})
export class CreateTaskInteractor extends AuthenticatedInteractor<CreateTaskData, TaskDto> {
  constructor(
    private repo: CreateTaskRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(CreateTaskSchema)
  @ValidateOutput(TaskDtoSchema)
  @Transaction
  async invoke(data: CreateTaskData): Validated<TaskDto> {
    const relatedContactIds = unique(data.contactIds);
    const relatedOrganizationIds = unique(data.organizationIds);
    const relatedDealIds = unique(data.dealIds);
    const relatedServiceIds = unique(data.serviceIds);

    const [previousContacts, previousOrganizations, previousDeals, previousServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const task = await this.repo.createTaskOrThrow(data);

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
      this.eventService.publish(DomainEvent.TASK_CREATED, {
        entityId: task.id,
        payload: task,
      }),
    ]);

    return { ok: true as const, data: task };
  }
}
