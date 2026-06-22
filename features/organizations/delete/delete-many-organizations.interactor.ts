import type { DeleteOrganizationRepo } from "./delete-organization.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { validateOrganizationIds } from "../../../core/validation/ids-validators";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { BULK_WRITE_TRANSACTION, Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getOrganizationRepo } from "@/core/di";

export const DeleteManyOrganizationsSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const organizationSet = new Set(data.ids);
    const validIdsSet = await getOrganizationRepo().findIds(organizationSet);
    validateOrganizationIds(data.ids, validIdsSet, ctx, ["ids"]);
  });
export type DeleteManyOrganizationsData = Data<typeof DeleteManyOrganizationsSchema>;

@TenantInteractor({ resource: Resource.organizations, action: Action.delete })
export class DeleteManyOrganizationsInteractor extends AuthenticatedInteractor<DeleteManyOrganizationsData, string[]> {
  constructor(
    private repo: DeleteOrganizationRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(DeleteManyOrganizationsSchema)
  @ValidateOutput(z.string())
  @Transaction(BULK_WRITE_TRANSACTION)
  async invoke(data: DeleteManyOrganizationsData): Validated<string[]> {
    const previousOrganizations = await this.repo.getManyOrThrowCompanyWide(data.ids);

    const relatedContactIds = unique(
      previousOrganizations.flatMap((organization) => organization.contacts.map((it) => it.id)),
    );
    const relatedDealIds = unique(
      previousOrganizations.flatMap((organization) => organization.deals.map((it) => it.id)),
    );
    const relatedTaskIds = unique(
      previousOrganizations.flatMap((organization) => organization.tasks.map((it) => it.id)),
    );

    const [previousContacts, previousDeals, previousTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const organizations = await Promise.all(data.ids.map((id) => this.repo.deleteOrganizationOrThrow(id)));

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
        this.eventService.publish(DomainEvent.ORGANIZATION_DELETED, {
          entityId: organization.id,
          payload: organization,
        }),
      ),
    ]);

    return { ok: true as const, data: data.ids };
  }
}
