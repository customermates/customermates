import type { CreateContactRepo } from "./create-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ContactWritePrecheckInteractor } from "./contact-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { validateNotes } from "@/core/validation/validate-notes";
import { type ContactDto, ContactDtoSchema } from "../contact.schema";

import { BaseCreateContactSchema } from "./create-contact-base.schema";
import { validateIdentifiers } from "./validate-identifiers";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateManyContactsSchema = z
  .object({
    contacts: z.array(BaseCreateContactSchema).min(1).max(100),
  })
  .superRefine((data, ctx) => {
    for (let i = 0; i < data.contacts.length; i++) {
      const contact = data.contacts[i];
      validateIdentifiers(contact.identifiers, ctx, ["contacts", i, "identifiers"]);
      contact.notes = validateNotes(contact.notes, ctx, ["contacts", i, "notes"]);
    }
  });
export type CreateManyContactsData = Data<typeof CreateManyContactsSchema>;

@TenantInteractor({
  resource: Resource.contacts,
  action: Action.create,
})
export class CreateManyContactsInteractor extends AuthenticatedInteractor<CreateManyContactsData, ContactDto[]> {
  constructor(
    private repo: CreateContactRepo,
    private organizationsRepo: GetCompanyWideOrganizationRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
    private precheck: ContactWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: CreateManyContactsSchema,
    output: ContactDtoSchema,
    precheck: (self, data, ctx) => self.precheck.createMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: CreateManyContactsData): Validated<ContactDto[]> {
    const relatedOrganizationIds = unique(data.contacts.flatMap((contact) => contact.organizationIds));
    const relatedDealIds = unique(data.contacts.flatMap((contact) => contact.dealIds));
    const relatedTaskIds = unique(data.contacts.flatMap((contact) => contact.taskIds));

    const [previousOrganizations, previousDeals, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const contacts = await Promise.all(data.contacts.map((contactData) => this.repo.createContactOrThrow(contactData)));

    const [currentOrganizations, currentDeals, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
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
      ...contacts.map((contact) =>
        this.eventService.publish(DomainEvent.CONTACT_CREATED, {
          entityId: contact.id,
          payload: contact,
        }),
      ),
    ]);

    return { ok: true as const, data: contacts };
  }
}
