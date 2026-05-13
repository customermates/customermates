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

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { validateDealIds } from "@/core/validation/validate-deal-ids";
import { BaseInteractor } from "@/core/base/base-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getDealRepo } from "@/core/app-di";

export const DeleteDealSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const dealSet = new Set([data.id]);
    const validIdsSet = await getDealRepo().findIds(dealSet);
    validateDealIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteDealData = Data<typeof DeleteDealSchema>;

@TentantInteractor({ resource: Resource.deals, action: Action.delete })
export class DeleteDealInteractor extends BaseInteractor<DeleteDealData, string> {
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

  @Validate(DeleteDealSchema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteDealData): Validated<string> {
    const previousDeal = await this.repo.getOrThrowUnscoped(data.id);

    const relatedOrganizationIds = unique(previousDeal.organizations.map((it) => it.id));
    const relatedContactIds = unique(previousDeal.contacts.map((it) => it.id));
    const relatedServiceIds = unique(previousDeal.services.map((it) => it.id));
    const relatedTaskIds = unique(previousDeal.tasks.map((it) => it.id));

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.servicesRepo.getManyOrThrowUnscoped(relatedServiceIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const deal = await this.repo.deleteDealOrThrow(data.id);

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
      this.eventService.publish(DomainEvent.DEAL_DELETED, {
        entityId: deal.id,
        payload: deal,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: data.id };
  }
}
