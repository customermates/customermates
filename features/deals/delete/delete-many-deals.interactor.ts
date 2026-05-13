import type { DeleteDealRepo } from "./delete-deal.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedServiceRepo } from "@/features/services/get-unscoped-service.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { validateDealIds } from "../../../core/validation/validate-deal-ids";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getDealRepo } from "@/core/app-di";

export const DeleteManyDealsSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const dealSet = new Set(data.ids);
    const validIdsSet = await getDealRepo().findIds(dealSet);
    validateDealIds(data.ids, validIdsSet, ctx, ["ids"]);
  });
export type DeleteManyDealsData = Data<typeof DeleteManyDealsSchema>;

@TentantInteractor({ resource: Resource.deals, action: Action.delete })
export class DeleteManyDealsInteractor extends BaseInteractor<DeleteManyDealsData, string[]> {
  constructor(
    private repo: DeleteDealRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private servicesRepo: GetUnscopedServiceRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(DeleteManyDealsSchema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteManyDealsData): Validated<string[]> {
    const previousDeals = await this.repo.getManyOrThrowUnscoped(data.ids);

    const relatedOrganizationIds = unique(previousDeals.flatMap((deal) => deal.organizations.map((it) => it.id)));
    const relatedContactIds = unique(previousDeals.flatMap((deal) => deal.contacts.map((it) => it.id)));
    const relatedServiceIds = unique(previousDeals.flatMap((deal) => deal.services.map((it) => it.id)));
    const relatedTaskIds = unique(previousDeals.flatMap((deal) => deal.tasks.map((it) => it.id)));

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const deals = await Promise.all(data.ids.map((id) => this.repo.deleteDealOrThrow(id)));

    const [currentOrganizations, currentContacts, currentServices, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
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
      ...currentContacts.map((contact, index) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes: calculateChanges(previousContacts[index], contact),
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
      ...currentTasks.map((task, index) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes: calculateChanges(previousTasks[index], task),
          },
        }),
      ),
      ...deals.map((deal) =>
        this.eventService.publish(DomainEvent.DEAL_DELETED, {
          entityId: deal.id,
          payload: deal,
        }),
      ),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: data.ids };
  }
}
