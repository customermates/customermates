import type { UpdateContactRepo } from "./update-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
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
import {
  type ContactIdentifiers,
  collectIdentifierPairs,
  validateIdentifierConflicts,
  validateIdentifiers,
} from "./validate-identifiers";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
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

export const UpdateManyContactsSchema = z
  .object({
    contacts: z.array(BaseUpdateContactSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const organizationSet = new Set<string>();
    const userSet = new Set<string>();
    const dealSet = new Set<string>();
    const contactSet = new Set<string>();
    const taskSet = new Set<string>();
    const identifierContacts: ContactIdentifiers[] = [];

    for (let i = 0; i < data.contacts.length; i++) {
      const contact = data.contacts[i];
      contactSet.add(contact.id);
      contact.organizationIds?.forEach((id) => organizationSet.add(id));
      contact.userIds?.forEach((id) => userSet.add(id));
      contact.dealIds?.forEach((id) => dealSet.add(id));
      contact.taskIds?.forEach((id) => taskSet.add(id));
      validateIdentifiers(contact.identifiers, ctx, ["contacts", i, "identifiers"]);
      identifierContacts.push({ selfContactId: contact.id, identifiers: contact.identifiers });
    }

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
      getContactRepo().findIdentifierOwners(collectIdentifierPairs(identifierContacts)),
    ]);

    for (let i = 0; i < data.contacts.length; i++) {
      const contact = data.contacts[i];
      validateContactIds(contact.id, validContactIdsSet, ctx, ["contacts", i, "id"]);
      validateOrganizationIds(contact.organizationIds, validOrgIdsSet, ctx, ["contacts", i, "organizationIds"]);
      validateUserIds(contact.userIds, validUserIdsSet, ctx, ["contacts", i, "userIds"]);
      validateAssigneeGuard(contact.userIds, currentUser.id, canReadAll, ctx, ["contacts", i, "userIds"]);
      validateDealIds(contact.dealIds, validDealIdsSet, ctx, ["contacts", i, "dealIds"]);
      validateTaskIds(contact.taskIds, validTaskIdsSet, ctx, ["contacts", i, "taskIds"]);
      validateCustomFieldValues(contact.customFieldValues, allColumns, ctx, ["contacts", i, "customFieldValues"]);
      contact.notes = validateNotes(contact.notes, ctx, ["contacts", i, "notes"]);
    }

    validateIdentifierConflicts(identifierContacts, identifierOwners, ctx, (i) => ["contacts", i, "identifiers"]);
  });
export type UpdateManyContactsData = Data<typeof UpdateManyContactsSchema>;
@TenantInteractor({
  resource: Resource.contacts,
  action: Action.update,
})
export class UpdateManyContactsInteractor extends AuthenticatedInteractor<UpdateManyContactsData, ContactDto[]> {
  constructor(
    private contactsRepo: UpdateContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpdateManyContactsSchema)
  @ValidateOutput(ContactDtoSchema)
  @Transaction
  async invoke(data: UpdateManyContactsData): Validated<ContactDto[]> {
    const previousContacts = await this.contactsRepo.getManyOrThrowUnscoped(data.contacts.map((c) => c.id));
    const previousContactsMap = new Map(previousContacts.map((c) => [c.id, c]));

    const relatedOrganizationIds = unique(
      previousContacts.flatMap((contact) => contact.organizations.map((it) => it.id)),
      data.contacts.flatMap((contactData) => contactData.organizationIds ?? []),
    );
    const relatedDealIds = unique(
      previousContacts.flatMap((contact) => contact.deals.map((it) => it.id)),
      data.contacts.flatMap((contactData) => contactData.dealIds ?? []),
    );
    const relatedTaskIds = unique(
      previousContacts.flatMap((contact) => contact.tasks.map((it) => it.id)),
      data.contacts.flatMap((contactData) => contactData.taskIds ?? []),
    );

    const [previousOrganizations, previousDeals, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const contacts = await Promise.all(
      data.contacts.map((contactData) => this.contactsRepo.updateContactOrThrow(contactData)),
    );

    const [currentOrganizations, currentDeals, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

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
      ...contacts.map((contact) => {
        const previousContact = previousContactsMap.get(contact.id);
        const changes = previousContact ? calculateChanges(previousContact, contact) : {};

        return this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        });
      }),
    ]);

    return { ok: true as const, data: contacts };
  }
}
