import type { CreateOrganizationRepo } from "./create-organization.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import {
  validateContactIds,
  validateUserIds,
  validateDealIds,
  validateTaskIds,
} from "../../../core/validation/ids-validators";
import { validateAssigneeGuard } from "../../../core/validation/validate-assignee-guard";
import { type OrganizationDto, OrganizationDtoSchema } from "../organization.schema";

import { BaseCreateOrganizationSchema } from "./create-organization-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BULK_WRITE_TRANSACTION, Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getUserRepo, getUserService, getContactRepo, getCustomColumnRepo, getDealRepo, getTaskRepo } from "@/core/di";

export const CreateManyOrganizationsSchema = z
  .object({
    organizations: z.array(BaseCreateOrganizationSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const contactSet = new Set<string>();
    const userSet = new Set<string>();
    const dealSet = new Set<string>();
    const taskSet = new Set<string>();

    for (const organization of data.organizations) {
      organization.contactIds.forEach((id) => contactSet.add(id));
      organization.userIds.forEach((id) => userSet.add(id));
      organization.dealIds.forEach((id) => dealSet.add(id));
      organization.taskIds.forEach((id) => taskSet.add(id));
    }

    const [validContactIdsSet, validUserIdsSet, validDealIdsSet, validTaskIdsSet, allColumns, currentUser, canReadAll] =
      await Promise.all([
        getContactRepo().findIds(contactSet),
        getUserRepo().findIds(userSet),
        getDealRepo().findIds(dealSet),
        getTaskRepo().findIds(taskSet),
        getCustomColumnRepo().findByEntityType(EntityType.organization),
        getUserService().getActiveUserOrThrow(),
        getUserService().hasPermission(Resource.organizations, Action.readAll),
      ]);

    for (let i = 0; i < data.organizations.length; i++) {
      const organization = data.organizations[i];
      validateContactIds(organization.contactIds, validContactIdsSet, ctx, ["organizations", i, "contactIds"]);
      validateUserIds(organization.userIds, validUserIdsSet, ctx, ["organizations", i, "userIds"]);
      validateAssigneeGuard(organization.userIds, currentUser.id, canReadAll, ctx, ["organizations", i, "userIds"]);
      validateDealIds(organization.dealIds, validDealIdsSet, ctx, ["organizations", i, "dealIds"]);
      validateTaskIds(organization.taskIds, validTaskIdsSet, ctx, ["organizations", i, "taskIds"]);
      validateCustomFieldValues(organization.customFieldValues, allColumns, ctx, [
        "organizations",
        i,
        "customFieldValues",
      ]);
      organization.notes = validateNotes(organization.notes, ctx, ["organizations", i, "notes"]);
    }
  });
export type CreateManyOrganizationsData = Data<typeof CreateManyOrganizationsSchema>;

@TenantInteractor({
  resource: Resource.organizations,
  action: Action.create,
})
export class CreateManyOrganizationsInteractor extends AuthenticatedInteractor<
  CreateManyOrganizationsData,
  OrganizationDto[]
> {
  constructor(
    private repo: CreateOrganizationRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(CreateManyOrganizationsSchema)
  @ValidateOutput(OrganizationDtoSchema)
  @Transaction(BULK_WRITE_TRANSACTION)
  async invoke(data: CreateManyOrganizationsData): Validated<OrganizationDto[]> {
    const relatedContactIds = unique(data.organizations.flatMap((organization) => organization.contactIds));
    const relatedDealIds = unique(data.organizations.flatMap((organization) => organization.dealIds));
    const relatedTaskIds = unique(data.organizations.flatMap((organization) => organization.taskIds));

    const [previousContacts, previousDeals, previousTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const organizations = await Promise.all(
      data.organizations.map((organizationData) => this.repo.createOrganizationOrThrow(organizationData)),
    );

    const [currentContacts, currentDeals, currentTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
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
      ...currentDeals.map((deal, index) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes: calculateChanges(previousDeals[index], deal),
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
      ...organizations.map((organization) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_CREATED, {
          entityId: organization.id,
          payload: organization,
        }),
      ),
    ]);

    return { ok: true as const, data: organizations };
  }
}
