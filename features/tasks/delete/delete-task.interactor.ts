import type { DeleteTaskRepo } from "./delete-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideServiceRepo } from "@/features/services/get-company-wide-service.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { TaskWritePrecheckInteractor } from "../upsert/task-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const DeleteTaskSchema = z.object({
  id: z.uuid(),
});
export type DeleteTaskData = Data<typeof DeleteTaskSchema>;

@TenantInteractor({ resource: Resource.tasks, action: Action.delete })
export class DeleteTaskInteractor extends AuthenticatedInteractor<DeleteTaskData, string> {
  constructor(
    private repo: DeleteTaskRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private organizationsRepo: GetCompanyWideOrganizationRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private servicesRepo: GetCompanyWideServiceRepo,
    private eventService: EventService,
    private precheck: TaskWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: DeleteTaskSchema,
    output: z.string(),
    precheck: (self, data, ctx) => self.precheck.delete(data, ctx),
  })
  async invoke(data: DeleteTaskData): Validated<string> {
    const previousTask = await this.repo.getOrThrowCompanyWide(data.id);

    const relatedContactIds = unique(previousTask.contacts.map((it) => it.id));
    const relatedOrganizationIds = unique(previousTask.organizations.map((it) => it.id));
    const relatedDealIds = unique(previousTask.deals.map((it) => it.id));
    const relatedServiceIds = unique(previousTask.services.map((it) => it.id));

    const [previousContacts, previousOrganizations, previousDeals, previousServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
    ]);

    const task = await this.repo.deleteTaskOrThrow(data.id);

    const [currentContacts, currentOrganizations, currentDeals, currentServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
    ]);

    await Promise.all([
      ...buildRelationChangePublishes(previousContacts, currentContacts, "tasks", (contact, changes) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousOrganizations, currentOrganizations, "tasks", (organization, changes) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousDeals, currentDeals, "tasks", (deal, changes) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousServices, currentServices, "tasks", (service, changes) =>
        this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes,
          },
        }),
      ),
      this.eventService.publish(DomainEvent.TASK_DELETED, {
        entityId: task.id,
        payload: task,
      }),
    ]);

    return { ok: true as const, data: data.id };
  }
}
