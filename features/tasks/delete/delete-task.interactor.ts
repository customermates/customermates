import type { DeleteTaskRepo } from "./delete-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { validateTaskIds, validateSystemTaskIds } from "@/core/validation/validate-task-ids";
import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getTaskRepo } from "@/core/app-di";

export const DeleteTaskSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const taskSet = new Set([data.id]);
    const repo = getTaskRepo();
    const [validIdsSet, systemTaskIdsSet] = await Promise.all([repo.findIds(taskSet), repo.findSystemTaskIds(taskSet)]);
    validateTaskIds(data.id, validIdsSet, ctx, ["id"]);
    validateSystemTaskIds(data.id, systemTaskIdsSet, ctx, ["id"]);
  });
export type DeleteTaskData = Data<typeof DeleteTaskSchema>;

@TenantInteractor({ resource: Resource.tasks, action: Action.delete })
export class DeleteTaskInteractor extends AuthenticatedInteractor<DeleteTaskData, string> {
  constructor(
    private repo: DeleteTaskRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(DeleteTaskSchema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteTaskData): Validated<string> {
    const previousTask = await this.repo.getOrThrowUnscoped(data.id);

    const relatedContactIds = unique(previousTask.contacts.map((it) => it.id));
    const relatedOrganizationIds = unique(previousTask.organizations.map((it) => it.id));
    const relatedDealIds = unique(previousTask.deals.map((it) => it.id));
    const relatedServiceIds = unique(previousTask.services.map((it) => it.id));

    const [previousContacts, previousOrganizations, previousDeals, previousServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
    ]);

    const task = await this.repo.deleteTaskOrThrow(data.id);

    const [currentContacts, currentOrganizations, currentDeals, currentServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
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
      ...currentServices.map((service, index) =>
        this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes: calculateChanges(previousServices[index], service),
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
