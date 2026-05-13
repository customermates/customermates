import type { DeleteOrganizationRepo } from "./delete-organization.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getOrganizationRepo } from "@/core/app-di";

export const DeleteOrganizationSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const organizationSet = new Set([data.id]);
    const validIdsSet = await getOrganizationRepo().findIds(organizationSet);
    validateOrganizationIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteOrganizationData = Data<typeof DeleteOrganizationSchema>;

@TentantInteractor({ resource: Resource.organizations, action: Action.delete })
export class DeleteOrganizationInteractor extends BaseInteractor<DeleteOrganizationData, string> {
  constructor(
    private repo: DeleteOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(DeleteOrganizationSchema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteOrganizationData): Validated<string> {
    const previousOrganization = await this.repo.getOrThrowUnscoped(data.id);

    const relatedContactIds = unique(previousOrganization.contacts.map((it) => it.id));
    const relatedDealIds = unique(previousOrganization.deals.map((it) => it.id));
    const relatedTaskIds = unique(previousOrganization.tasks.map((it) => it.id));

    const [previousContacts, previousDeals, previousTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const organization = await this.repo.deleteOrganizationOrThrow(data.id);

    const [currentContacts, currentDeals, currentTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
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
      this.eventService.publish(DomainEvent.ORGANIZATION_DELETED, {
        entityId: organization.id,
        payload: organization,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: data.id };
  }
}
