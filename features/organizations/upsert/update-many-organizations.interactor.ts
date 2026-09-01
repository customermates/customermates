import type { UpdateOrganizationRepo } from "./update-organization.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { OrganizationWritePrecheckInteractor } from "./organization-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { validateNotes } from "@/core/validation/validate-notes";
import { type OrganizationDto, OrganizationDtoSchema } from "../organization.schema";

import { BaseUpdateOrganizationSchema } from "./update-organization-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { unique } from "@/core/utils/unique";

export const UpdateManyOrganizationsSchema = z.object({
  organizations: z
    .array(
      BaseUpdateOrganizationSchema.superRefine((organization, ctx) => {
        organization.notes = validateNotes(organization.notes, ctx, ["notes"]);
      }),
    )
    .min(1)
    .max(100),
});
export type UpdateManyOrganizationsData = Data<typeof UpdateManyOrganizationsSchema>;

@TenantInteractor({
  resource: Resource.organizations,
  action: Action.update,
})
export class UpdateManyOrganizationsInteractor extends AuthenticatedInteractor<
  UpdateManyOrganizationsData,
  OrganizationDto[]
> {
  constructor(
    private organizationsRepo: UpdateOrganizationRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
    private precheck: OrganizationWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: UpdateManyOrganizationsSchema,
    output: OrganizationDtoSchema,
    precheck: (self, data, ctx) => self.precheck.updateMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: UpdateManyOrganizationsData): Validated<OrganizationDto[]> {
    const previousOrganizations = await this.organizationsRepo.getManyOrThrowCompanyWide(
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
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const organizations = await Promise.all(
      data.organizations.map((organizationData) => this.organizationsRepo.updateOrganizationOrThrow(organizationData)),
    );

    const [currentContacts, currentDeals, currentTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
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
        const changes = calculateChanges(previousOrganizationsMap.get(organization.id), organization);

        return this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes,
          },
        });
      }),
    ]);

    return { ok: true as const, data: organizations };
  }
}
