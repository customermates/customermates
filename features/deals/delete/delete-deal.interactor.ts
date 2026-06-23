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
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const DeleteDealSchema = z.object({
  id: z.uuid(),
});
export type DeleteDealData = Data<typeof DeleteDealSchema>;

@TenantInteractor({ resource: Resource.deals, action: Action.delete })
export class DeleteDealInteractor extends AuthenticatedInteractor<DeleteDealData, string> {
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
    input: DeleteDealSchema,
    output: z.string(),
    precheck: (self, data, ctx) => self.precheck.delete(data, ctx),
  })
  async invoke(data: DeleteDealData): Validated<string> {
    const previousDeal = await this.repo.getOrThrowCompanyWide(data.id);

    const relatedOrganizationIds = unique(previousDeal.organizations.map((it) => it.id));
    const relatedContactIds = unique(previousDeal.contacts.map((it) => it.id));
    const relatedServiceIds = unique(previousDeal.services.map((it) => it.id));
    const relatedTaskIds = unique(previousDeal.tasks.map((it) => it.id));

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const deal = await this.repo.deleteDealOrThrow(data.id);

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
      this.eventService.publish(DomainEvent.DEAL_DELETED, {
        entityId: deal.id,
        payload: deal,
      }),
    ]);

    return { ok: true as const, data: data.id };
  }
}
