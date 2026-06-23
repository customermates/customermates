import type { CreateOrganizationRepo } from "./create-organization.repo";
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

import { BaseCreateOrganizationSchema } from "./create-organization-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateManyOrganizationsSchema = z
  .object({
    organizations: z.array(BaseCreateOrganizationSchema).min(1).max(100),
  })
  .superRefine((data, ctx) => {
    for (let i = 0; i < data.organizations.length; i++) {
      const organization = data.organizations[i];
      organization.notes = validateNotes(organization.notes, ctx, ["organizations", i, "notes"]);
    }
  });
export type CreateManyOrganizationsData = Data<typeof CreateManyOrganizationsSchema>;

@TenantInteractor({
  resource: Resource.organizations,
  action: Action.create,
})
export class CreateManyOrganizationsInteractor extends AuthenticatedInteractor<
  CreateManyOrganizationsData,
  OrganizationDto[]
> {
  constructor(
    private repo: CreateOrganizationRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
    private precheck: OrganizationWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: CreateManyOrganizationsSchema,
    output: OrganizationDtoSchema,
    precheck: (self, data, ctx) => self.precheck.createMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: CreateManyOrganizationsData): Validated<OrganizationDto[]> {
    const relatedContactIds = unique(data.organizations.flatMap((organization) => organization.contactIds));
    const relatedDealIds = unique(data.organizations.flatMap((organization) => organization.dealIds));
    const relatedTaskIds = unique(data.organizations.flatMap((organization) => organization.taskIds));

    const [previousContacts, previousDeals, previousTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const organizations = await Promise.all(
      data.organizations.map((organizationData) => this.repo.createOrganizationOrThrow(organizationData)),
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
      ...organizations.map((organization) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_CREATED, {
          entityId: organization.id,
          payload: organization,
        }),
      ),
    ]);

    return { ok: true as const, data: organizations };
  }
}
