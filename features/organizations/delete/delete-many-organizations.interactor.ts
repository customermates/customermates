import type { DeleteOrganizationRepo } from "./delete-organization.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { OrganizationWritePrecheckInteractor } from "../upsert/organization-write-precheck.interactor";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const DeleteManyOrganizationsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
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
    private precheck: OrganizationWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: DeleteManyOrganizationsSchema,
    output: z.string(),
    precheck: (self, data, ctx) => self.precheck.deleteMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
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
