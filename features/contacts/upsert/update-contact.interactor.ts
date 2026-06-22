import type { UpdateContactRepo } from "./update-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import {
  validateContactIds,
  validateDealIds,
  validateOrganizationIds,
  validateUserIds,
  validateTaskIds,
} from "../../../core/validation/ids-validators";
import { validateAssigneeGuard } from "../../../core/validation/validate-assignee-guard";
import { type ContactDto, ContactDtoSchema } from "../contact.schema";

import { BaseUpdateContactSchema } from "./update-contact-base.schema";
import { collectIdentifierPairs, validateIdentifierConflicts, validateIdentifiers } from "./validate-identifiers";

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

export const UpdateContactSchema = BaseUpdateContactSchema.superRefine(async (data, ctx) => {
  const organizationSet = new Set(data.organizationIds ?? []);
  const userSet = new Set(data.userIds ?? []);
  const dealSet = new Set(data.dealIds ?? []);
  const contactSet = new Set([data.id]);
  const taskSet = new Set(data.taskIds ?? []);

  validateIdentifiers(data.identifiers, ctx, ["identifiers"]);

  const [
    validOrgIdsSet,
    validUserIdsSet,
    validDealIdsSet,
    validContactIdsSet,
    validTaskIdsSet,
    allColumns,
    currentUser,
    canReadAll,
    identifierOwners,
  ] = await Promise.all([
    getOrganizationRepo().findIds(organizationSet),
    getUserRepo().findIds(userSet),
    getDealRepo().findIds(dealSet),
    getContactRepo().findIds(contactSet),
    getTaskRepo().findIds(taskSet),
    getCustomColumnRepo().findByEntityType(EntityType.contact),
    getUserService().getActiveUserOrThrow(),
    getUserService().hasPermission(Resource.contacts, Action.readAll),
    getContactRepo().findIdentifierOwnersCompanyWide(
      collectIdentifierPairs([{ selfContactId: undefined, identifiers: data.identifiers }]),
    ),
  ]);

  validateContactIds(data.id, validContactIdsSet, ctx, ["id"]);
  validateOrganizationIds(data.organizationIds, validOrgIdsSet, ctx, ["organizationIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateAssigneeGuard(data.userIds, currentUser.id, canReadAll, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateTaskIds(data.taskIds, validTaskIdsSet, ctx, ["taskIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
  validateIdentifierConflicts(
    [{ selfContactId: validContactIdsSet.get(data.id), identifiers: data.identifiers }],
    identifierOwners,
    ctx,
    () => ["identifiers"],
  );
});
export type UpdateContactData = Data<typeof UpdateContactSchema>;

@TenantInteractor({
  resource: Resource.contacts,
  action: Action.update,
})
export class UpdateContactInteractor extends AuthenticatedInteractor<UpdateContactData, ContactDto> {
  constructor(
    private contactsRepo: UpdateContactRepo,
    private organizationsRepo: GetCompanyWideOrganizationRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpdateContactSchema)
  @ValidateOutput(ContactDtoSchema)
  @Transaction
  async invoke(data: UpdateContactData): Validated<ContactDto> {
    const previousContact = await this.contactsRepo.getOrThrowCompanyWide(data.id);

    const relatedOrganizationIds = unique(
      previousContact.organizations.map((it) => it.id),
      data.organizationIds,
    );
    const relatedDealIds = unique(
      previousContact.deals.map((it) => it.id),
      data.dealIds,
    );
    const relatedTaskIds = unique(
      previousContact.tasks.map((it) => it.id),
      data.taskIds,
    );

    const [previousOrganizations, previousDeals, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const contact = await this.contactsRepo.updateContactOrThrow(data);

    const [currentOrganizations, currentDeals, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const changes = calculateChanges(previousContact, contact);

    await Promise.all([
      ...buildRelationChangePublishes(
        previousOrganizations,
        currentOrganizations,
        "contacts",
        (organization, changes) =>
          this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
            entityId: organization.id,
            payload: {
              organization,
              changes,
            },
          }),
      ),
      ...buildRelationChangePublishes(previousDeals, currentDeals, "contacts", (deal, changes) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousTasks, currentTasks, "contacts", (task, changes) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes,
          },
        }),
      ),
      this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: contact.id,
        payload: {
          contact,
          changes,
        },
      }),
    ]);

    return { ok: true as const, data: contact };
  }
}
