import type { DeleteContactRepo } from "./delete-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";
import { z } from "zod";

import { validateContactIds } from "../validate-contact-ids";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getContactRepo } from "@/core/app-di";

export const DeleteContactSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const contactSet = new Set([data.id]);
    const validIdsSet = await getContactRepo().findIds(contactSet);
    validateContactIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteContactData = Data<typeof DeleteContactSchema>;

@TenantInteractor({ resource: Resource.contacts, action: Action.delete })
export class DeleteContactInteractor extends AuthenticatedInteractor<DeleteContactData, string> {
  constructor(
    private repo: DeleteContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(DeleteContactSchema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteContactData): Validated<string> {
    const previousContact = await this.repo.getOrThrowUnscoped(data.id);

    const relatedOrganizationIds = unique(previousContact.organizations.map((it) => it.id));
    const relatedDealIds = unique(previousContact.deals.map((it) => it.id));
    const relatedTaskIds = unique(previousContact.tasks.map((it) => it.id));

    const [previousOrganizations, previousDeals, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const contact = await this.repo.deleteContactOrThrow(data.id);

    const [currentOrganizations, currentDeals, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
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
      this.eventService.publish(DomainEvent.CONTACT_DELETED, {
        entityId: contact.id,
        payload: contact,
      }),
    ]);

    return { ok: true as const, data: data.id };
  }
}
