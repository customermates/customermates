import type { UpdateDealRepo } from "./update-deal.repo";
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

import { BaseUpdateDealSchema } from "./update-deal-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { unique } from "@/core/utils/unique";

export const UpdateManyDealsSchema = z.object({
  deals: z
    .array(
      BaseUpdateDealSchema.superRefine((deal, ctx) => {
        deal.notes = validateNotes(deal.notes, ctx, ["notes"]);
      }),
    )
    .min(1)
    .max(100),
});
export type UpdateManyDealsData = Data<typeof UpdateManyDealsSchema>;

@TenantInteractor({
  resource: Resource.deals,
  action: Action.update,
})
export class UpdateManyDealsInteractor extends AuthenticatedInteractor<UpdateManyDealsData, DealDto[]> {
  constructor(
    private dealsRepo: UpdateDealRepo,
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
    input: UpdateManyDealsSchema,
    output: DealDtoSchema,
    precheck: (self, data, ctx) => self.precheck.updateMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: UpdateManyDealsData): Validated<DealDto[]> {
    const previousDeals = await this.dealsRepo.getManyOrThrowCompanyWide(data.deals.map((d) => d.id));
    const previousDealsMap = new Map(previousDeals.map((d) => [d.id, d]));

    const relatedOrganizationIds = unique(
      previousDeals.flatMap((deal) => deal.organizations.map((it) => it.id)),
      data.deals.flatMap((dealData) => dealData.organizationIds ?? []),
    );
    const relatedContactIds = unique(
      previousDeals.flatMap((deal) => deal.contacts.map((it) => it.id)),
      data.deals.flatMap((dealData) => dealData.contactIds ?? []),
    );
    const relatedServiceIds = unique(
      previousDeals.flatMap((deal) => deal.services.map((it) => it.id)),
      data.deals.flatMap((dealData) => dealData.services?.map((s) => s.serviceId) ?? []),
    );
    const relatedTaskIds = unique(
      previousDeals.flatMap((deal) => deal.tasks.map((it) => it.id)),
      data.deals.flatMap((dealData) => dealData.taskIds ?? []),
    );

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const deals = await Promise.all(data.deals.map((dealData) => this.dealsRepo.updateDealOrThrow(dealData)));

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
      ...deals.map((deal) => {
        const changes = calculateChanges(previousDealsMap.get(deal.id), deal);

        return this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        });
      }),
    ]);

    return { ok: true as const, data: deals };
  }
}
