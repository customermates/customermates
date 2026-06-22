import type { UpdateOrganizationRepo } from "./update-organization.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import {
  validateContactIds,
  validateUserIds,
  validateDealIds,
  validateOrganizationIds,
  validateTaskIds,
} from "@/core/validation/ids-validators";
import { validateAssigneeGuard } from "../../../core/validation/validate-assignee-guard";
import { type OrganizationDto, OrganizationDtoSchema } from "../organization.schema";

import { BaseUpdateOrganizationSchema } from "./update-organization-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";
import {
  getUserRepo,
  getUserService,
  getContactRepo,
  getCustomColumnRepo,
  getDealRepo,
  getOrganizationRepo,
  getTaskRepo,
} from "@/core/di";

export const UpdateOrganizationSchema = BaseUpdateOrganizationSchema.superRefine(async (data, ctx) => {
  const contactSet = new Set(data.contactIds ?? []);
  const userSet = new Set(data.userIds ?? []);
  const dealSet = new Set(data.dealIds ?? []);
  const organizationSet = new Set([data.id]);
  const taskSet = new Set(data.taskIds ?? []);

  const [
    validContactIdsSet,
    validUserIdsSet,
    validDealIdsSet,
    validOrgIdsSet,
    validTaskIdsSet,
    allColumns,
    currentUser,
    canReadAll,
  ] = await Promise.all([
    getContactRepo().findIds(contactSet),
    getUserRepo().findIds(userSet),
    getDealRepo().findIds(dealSet),
    getOrganizationRepo().findIds(organizationSet),
    getTaskRepo().findIds(taskSet),
    getCustomColumnRepo().findByEntityType(EntityType.organization),
    getUserService().getActiveUserOrThrow(),
    getUserService().hasPermission(Resource.organizations, Action.readAll),
  ]);

  validateOrganizationIds(data.id, validOrgIdsSet, ctx, ["id"]);
  validateContactIds(data.contactIds, validContactIdsSet, ctx, ["contactIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateAssigneeGuard(data.userIds, currentUser.id, canReadAll, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateTaskIds(data.taskIds, validTaskIdsSet, ctx, ["taskIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateOrganizationData = Data<typeof UpdateOrganizationSchema>;

@TenantInteractor({
  resource: Resource.organizations,
  action: Action.update,
})
export class UpdateOrganizationInteractor extends AuthenticatedInteractor<UpdateOrganizationData, OrganizationDto> {
  constructor(
    private organizationsRepo: UpdateOrganizationRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpdateOrganizationSchema)
  @ValidateOutput(OrganizationDtoSchema)
  @Transaction
  async invoke(data: UpdateOrganizationData): Validated<OrganizationDto> {
    const previousOrganization = await this.organizationsRepo.getOrThrowCompanyWide(data.id);

    const relatedContactIds = unique(
      previousOrganization.contacts.map((it) => it.id),
      data.contactIds,
    );
    const relatedDealIds = unique(
      previousOrganization.deals.map((it) => it.id),
      data.dealIds,
    );
    const relatedTaskIds = unique(
      previousOrganization.tasks.map((it) => it.id),
      data.taskIds,
    );

    const [previousContacts, previousDeals, previousTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const organization = await this.organizationsRepo.updateOrganizationOrThrow(data);

    const [currentContacts, currentDeals, currentTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const changes = calculateChanges(previousOrganization, organization);

    await Promise.all([
      ...buildRelationChangePublishes(previousContacts, currentContacts, "organizations", (contact, changes) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousDeals, currentDeals, "organizations", (deal, changes) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousTasks, currentTasks, "organizations", (task, changes) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes,
          },
        }),
      ),
      this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
        entityId: organization.id,
        payload: {
          organization,
          changes,
        },
      }),
    ]);

    return { ok: true as const, data: organization };
  }
}
