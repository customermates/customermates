import type { UpdateOrganizationRepo } from "./update-organization.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetUnscopedContactRepo } from "@/features/contacts/get-unscoped-contact.repo";
import type { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import type { GetUnscopedTaskRepo } from "@/features/tasks/get-unscoped-task.repo";
import type { WidgetService } from "@/features/widget/widget.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, EntityType } from "@/generated/prisma";

import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { validateNotes } from "../../../core/validation/validate-notes";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { validateTaskIds } from "../../../core/validation/validate-task-ids";
import { type OrganizationDto, OrganizationDtoSchema } from "../organization.schema";

import { BaseUpdateOrganizationSchema } from "./update-organization-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";
import { unique } from "@/core/utils/unique";
import {
  getCompanyRepo,
  getContactRepo,
  getCustomColumnRepo,
  getDealRepo,
  getOrganizationRepo,
  getTaskRepo,
} from "@/core/di";

export const UpdateManyOrganizationsSchema = z
  .object({
    organizations: z.array(BaseUpdateOrganizationSchema).min(1).max(100),
  })
  .superRefine(async (data, ctx) => {
    const contactSet = new Set<string>();
    const userSet = new Set<string>();
    const dealSet = new Set<string>();
    const organizationSet = new Set<string>();
    const taskSet = new Set<string>();

    for (const organization of data.organizations) {
      organizationSet.add(organization.id);
      organization.contactIds?.forEach((id) => contactSet.add(id));
      organization.userIds?.forEach((id) => userSet.add(id));
      organization.dealIds?.forEach((id) => dealSet.add(id));
      organization.taskIds?.forEach((id) => taskSet.add(id));
    }

    const [validContactIdsSet, validUserIdsSet, validDealIdsSet, validOrgIdsSet, validTaskIdsSet, allColumns] =
      await Promise.all([
        getContactRepo().findIds(contactSet),
        getCompanyRepo().findIds(userSet),
        getDealRepo().findIds(dealSet),
        getOrganizationRepo().findIds(organizationSet),
        getTaskRepo().findIds(taskSet),
        getCustomColumnRepo().findByEntityType(EntityType.organization),
      ]);

    for (let i = 0; i < data.organizations.length; i++) {
      const organization = data.organizations[i];
      validateOrganizationIds(organization.id, validOrgIdsSet, ctx, ["organizations", i, "id"]);
      validateContactIds(organization.contactIds, validContactIdsSet, ctx, ["organizations", i, "contactIds"]);
      validateUserIds(organization.userIds, validUserIdsSet, ctx, ["organizations", i, "userIds"]);
      validateDealIds(organization.dealIds, validDealIdsSet, ctx, ["organizations", i, "dealIds"]);
      validateTaskIds(organization.taskIds, validTaskIdsSet, ctx, ["organizations", i, "taskIds"]);
      validateCustomFieldValues(organization.customFieldValues, allColumns, ctx, [
        "organizations",
        i,
        "customFieldValues",
      ]);
      organization.notes = validateNotes(organization.notes, ctx, ["organizations", i, "notes"]);
    }
  });
export type UpdateManyOrganizationsData = Data<typeof UpdateManyOrganizationsSchema>;

@TentantInteractor({
  resource: Resource.organizations,
  action: Action.update,
})
export class UpdateManyOrganizationsInteractor extends BaseInteractor<UpdateManyOrganizationsData, OrganizationDto[]> {
  constructor(
    private organizationsRepo: UpdateOrganizationRepo,
    private contactsRepo: GetUnscopedContactRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private tasksRepo: GetUnscopedTaskRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {
    super();
  }

  @Validate(UpdateManyOrganizationsSchema)
  @ValidateOutput(OrganizationDtoSchema)
  @Transaction
  async invoke(data: UpdateManyOrganizationsData): Validated<OrganizationDto[]> {
    const previousOrganizations = await this.organizationsRepo.getManyOrThrowUnscoped(
      data.organizations.map((o) => o.id),
    );
    const previousOrganizationsMap = new Map(previousOrganizations.map((o) => [o.id, o]));

    const relatedContactIds = unique(
      previousOrganizations.flatMap((organization) => organization.contacts.map((it) => it.id)),
      data.organizations.flatMap((organizationData) => organizationData.contactIds ?? []),
    );
    const relatedDealIds = unique(
      previousOrganizations.flatMap((organization) => organization.deals.map((it) => it.id)),
      data.organizations.flatMap((organizationData) => organizationData.dealIds ?? []),
    );
    const relatedTaskIds = unique(
      previousOrganizations.flatMap((organization) => organization.tasks.map((it) => it.id)),
      data.organizations.flatMap((organizationData) => organizationData.taskIds ?? []),
    );

    const [previousContacts, previousDeals, previousTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    const organizations = await Promise.all(
      data.organizations.map((organizationData) => this.organizationsRepo.updateOrganizationOrThrow(organizationData)),
    );

    const [currentContacts, currentDeals, currentTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowUnscoped(relatedContactIds),
      this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds),
      this.tasksRepo.getManyOrThrowUnscoped(relatedTaskIds),
    ]);

    await Promise.all([
      ...buildRelationChangePublishes(previousContacts, currentContacts, "organizations", (contact, changes) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousDeals, currentDeals, "organizations", (deal, changes) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousTasks, currentTasks, "organizations", (task, changes) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes,
          },
        }),
      ),
      ...organizations.map((organization) => {
        const previousOrganization = previousOrganizationsMap.get(organization.id);
        const changes = previousOrganization ? calculateChanges(previousOrganization, organization) : {};

        return this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes,
          },
        });
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true as const, data: organizations };
  }
}
