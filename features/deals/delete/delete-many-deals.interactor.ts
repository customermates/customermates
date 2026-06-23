import type { DeleteDealRepo } from "./delete-deal.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideServiceRepo } from "@/features/services/get-company-wide-service.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { DealWritePrecheckInteractor } from "../upsert/deal-write-precheck.interactor";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const DeleteManyDealsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
});
export type DeleteManyDealsData = Data<typeof DeleteManyDealsSchema>;

@TenantInteractor({ resource: Resource.deals, action: Action.delete })
export class DeleteManyDealsInteractor extends AuthenticatedInteractor<DeleteManyDealsData, string[]> {
  constructor(
    private repo: DeleteDealRepo,
    private organizationsRepo: GetCompanyWideOrganizationRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private servicesRepo: GetCompanyWideServiceRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
    private precheck: DealWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: DeleteManyDealsSchema,
    output: z.string(),
    precheck: (self, data, ctx) => self.precheck.deleteMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: DeleteManyDealsData): Validated<string[]> {
    const previousDeals = await this.repo.getManyOrThrowCompanyWide(data.ids);

    const relatedOrganizationIds = unique(previousDeals.flatMap((deal) => deal.organizations.map((it) => it.id)));
    const relatedContactIds = unique(previousDeals.flatMap((deal) => deal.contacts.map((it) => it.id)));
    const relatedServiceIds = unique(previousDeals.flatMap((deal) => deal.services.map((it) => it.id)));
    const relatedTaskIds = unique(previousDeals.flatMap((deal) => deal.tasks.map((it) => it.id)));

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const deals = await Promise.all(data.ids.map((id) => this.repo.deleteDealOrThrow(id)));

    const [currentOrganizations, currentContacts, currentServices, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    await Promise.all([
      ...buildRelationChangePublishes(previousOrganizations, currentOrganizations, "deals", (organization, changes) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousContacts, currentContacts, "deals", (contact, changes) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousServices, currentServices, "deals", (service, changes) =>
        this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousTasks, currentTasks, "deals", (task, changes) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes,
          },
        }),
      ),
      ...deals.map((deal) =>
        this.eventService.publish(DomainEvent.DEAL_DELETED, {
          entityId: deal.id,
          payload: deal,
        }),
      ),
    ]);

    return { ok: true as const, data: data.ids };
  }
}
