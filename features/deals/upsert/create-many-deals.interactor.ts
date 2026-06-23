import type { CreateDealRepo } from "./create-deal.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideServiceRepo } from "@/features/services/get-company-wide-service.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { DealWritePrecheckInteractor } from "./deal-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { validateNotes } from "@/core/validation/validate-notes";
import { type DealDto, DealDtoSchema } from "../deal.schema";

import { BaseCreateDealSchema } from "./create-deal-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateManyDealsSchema = z
  .object({
    deals: z.array(BaseCreateDealSchema).min(1).max(100),
  })
  .superRefine((data, ctx) => {
    for (let i = 0; i < data.deals.length; i++) {
      const deal = data.deals[i];
      deal.notes = validateNotes(deal.notes, ctx, ["deals", i, "notes"]);
    }
  });
export type CreateManyDealsData = Data<typeof CreateManyDealsSchema>;

@TenantInteractor({
  resource: Resource.deals,
  action: Action.create,
})
export class CreateManyDealsInteractor extends AuthenticatedInteractor<CreateManyDealsData, DealDto[]> {
  constructor(
    private repo: CreateDealRepo,
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
    input: CreateManyDealsSchema,
    output: DealDtoSchema,
    precheck: (self, data, ctx) => self.precheck.createMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: CreateManyDealsData): Validated<DealDto[]> {
    const relatedOrganizationIds = unique(data.deals.flatMap((deal) => deal.organizationIds));
    const relatedContactIds = unique(data.deals.flatMap((deal) => deal.contactIds));
    const relatedServiceIds = unique(data.deals.flatMap((deal) => deal.services.map((s) => s.serviceId)));
    const relatedTaskIds = unique(data.deals.flatMap((deal) => deal.taskIds));

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const deals = await Promise.all(data.deals.map((dealData) => this.repo.createDealOrThrow(dealData)));

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
        this.eventService.publish(DomainEvent.DEAL_CREATED, {
          entityId: deal.id,
          payload: deal,
        }),
      ),
    ]);

    return { ok: true as const, data: deals };
  }
}
