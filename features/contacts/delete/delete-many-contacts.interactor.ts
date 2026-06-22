import type { DeleteContactRepo } from "./delete-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { validateContactIds } from "@/core/validation/ids-validators";
import { ContactKeySchema } from "../contact-key";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BULK_WRITE_TRANSACTION, Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getContactRepo } from "@/core/di";

export const DeleteManyContactsSchema = z
  .object({
    ids: z.array(ContactKeySchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const contactSet = new Set(data.ids);
    const validIdsSet = await getContactRepo().findIds(contactSet);
    validateContactIds(data.ids, validIdsSet, ctx, ["ids"]);
  });
export type DeleteManyContactsData = Data<typeof DeleteManyContactsSchema>;

@TenantInteractor({ resource: Resource.contacts, action: Action.delete })
export class DeleteManyContactsInteractor extends AuthenticatedInteractor<DeleteManyContactsData, string[]> {
  constructor(
    private repo: DeleteContactRepo,
    private organizationsRepo: GetCompanyWideOrganizationRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(DeleteManyContactsSchema)
  @ValidateOutput(z.string())
  @Transaction(BULK_WRITE_TRANSACTION)
  async invoke(data: DeleteManyContactsData): Validated<string[]> {
    const previousContacts = await this.repo.getManyOrThrowCompanyWide(data.ids);

    const relatedOrganizationIds = unique(
      previousContacts.flatMap((contact) => contact.organizations.map((it) => it.id)),
    );
    const relatedDealIds = unique(previousContacts.flatMap((contact) => contact.deals.map((it) => it.id)));
    const relatedTaskIds = unique(previousContacts.flatMap((contact) => contact.tasks.map((it) => it.id)));

    const [previousOrganizations, previousDeals, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const contacts = await Promise.all(previousContacts.map((contact) => this.repo.deleteContactOrThrow(contact.id)));

    const [currentOrganizations, currentDeals, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
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
      ...contacts.map((contact) =>
        this.eventService.publish(DomainEvent.CONTACT_DELETED, {
          entityId: contact.id,
          payload: contact,
        }),
      ),
    ]);

    return { ok: true as const, data: previousContacts.map((contact) => contact.id) };
  }
}
