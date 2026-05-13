import type { CreateContactRepo } from "./create-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedOrganizationRepo } from "@/features/organizations/get-unscoped-organization.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateTaskIds } from "../../../core/validation/validate-task-ids";
import { type ContactDto, ContactDtoSchema } from "../contact.schema";

import { BaseCreateContactSchema } from "./create-contact-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { getCompanyRepo, getCustomColumnRepo, getDealRepo, getOrganizationRepo, getTaskRepo } from "@/core/app-di";

export const CreateContactSchema = BaseCreateContactSchema.superRefine(async (data, ctx) => {
  const allOrgIds = new Set(data.organizationIds);
  const allUserIds = new Set(data.userIds);
  const allDealIds = new Set(data.dealIds);
  const allTaskIds = new Set(data.taskIds);

  const [validOrgIdsSet, validUserIdsSet, validDealIdsSet, validTaskIdsSet, allColumns] = await Promise.all([
    getOrganizationRepo().findIds(allOrgIds),
    getCompanyRepo().findIds(allUserIds),
    getDealRepo().findIds(allDealIds),
    getTaskRepo().findIds(allTaskIds),
    getCustomColumnRepo().findByEntityType(EntityType.contact),
  ]);

  validateOrganizationIds(data.organizationIds, validOrgIdsSet, ctx, ["organizationIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateTaskIds(data.taskIds, validTaskIdsSet, ctx, ["taskIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateContactData = Data<typeof CreateContactSchema>;

@TentantInteractor({
  resource: Resource.contacts,
  action: Action.create,
})
export class CreateContactInteractor extends BaseInteractor<CreateContactData, ContactDto> {
  constructor(
    private repo: CreateContactRepo,
    private organizationsRepo: GetUnscopedOrganizationRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(CreateContactSchema)
  @ValidateOutput(ContactDtoSchema)
  @Transaction
  async invoke(data: CreateContactData): Validated<ContactDto> {
    const relatedOrganizationIds = unique(data.organizationIds);
    const relatedDealIds = unique(data.dealIds);
    const relatedTaskIds = unique(data.taskIds);

    const [previousOrganizations, previousDeals, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowUnscoped(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const contact = await this.repo.createContactOrThrow(data);

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
      this.eventService.publish(DomainEvent.CONTACT_CREATED, {
        entityId: contact.id,
        payload: contact,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: contact };
  }
}
