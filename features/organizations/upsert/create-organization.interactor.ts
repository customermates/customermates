import type { CreateOrganizationRepo } from "./create-organization.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateTaskIds } from "../../../core/validation/validate-task-ids";
import { type OrganizationDto, OrganizationDtoSchema } from "../organization.schema";

import { BaseCreateOrganizationSchema } from "./create-organization-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getContactRepo, getCustomColumnRepo, getDealRepo, getTaskRepo } from "@/core/app-di";

export const CreateOrganizationSchema = BaseCreateOrganizationSchema.superRefine(async (data, ctx) => {
  const contactSet = new Set(data.contactIds);
  const userSet = new Set(data.userIds);
  const dealSet = new Set(data.dealIds);
  const taskSet = new Set(data.taskIds);

  const [validContactIdsSet, validUserIdsSet, validDealIdsSet, validTaskIdsSet, allColumns] = await Promise.all([
    getContactRepo().findIds(contactSet),
    getCompanyRepo().findIds(userSet),
    getDealRepo().findIds(dealSet),
    getTaskRepo().findIds(taskSet),
    getCustomColumnRepo().findByEntityType(EntityType.organization),
  ]);

  validateContactIds(data.contactIds, validContactIdsSet, ctx, ["contactIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateTaskIds(data.taskIds, validTaskIdsSet, ctx, ["taskIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateOrganizationData = Data<typeof CreateOrganizationSchema>;

@TentantInteractor({
  resource: Resource.organizations,
  action: Action.create,
})
export class CreateOrganizationInteractor extends BaseInteractor<CreateOrganizationData, OrganizationDto> {
  constructor(
    private repo: CreateOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(CreateOrganizationSchema)
  @ValidateOutput(OrganizationDtoSchema)
  @Transaction
  async invoke(data: CreateOrganizationData): Validated<OrganizationDto> {
    const relatedContactIds = unique(data.contactIds);
    const relatedDealIds = unique(data.dealIds);
    const relatedTaskIds = unique(data.taskIds);

    const [previousContacts, previousDeals, previousTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const organization = await this.repo.createOrganizationOrThrow(data);

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
      this.eventService.publish(DomainEvent.ORGANIZATION_CREATED, {
        entityId: organization.id,
        payload: organization,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: organization };
  }
}
