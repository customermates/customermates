import type { CreateOrganizationRepo } from "./create-organization.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { OrganizationWritePrecheckInteractor } from "./organization-write-precheck.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type OrganizationDto, OrganizationDtoSchema } from "../organization.schema";

import { BaseCreateOrganizationSchema } from "./create-organization-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateOrganizationSchema = BaseCreateOrganizationSchema.superRefine((data, ctx) => {
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateOrganizationData = Data<typeof CreateOrganizationSchema>;

@TenantInteractor({
  resource: Resource.organizations,
  action: Action.create,
})
export class CreateOrganizationInteractor extends AuthenticatedInteractor<CreateOrganizationData, OrganizationDto> {
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
    input: CreateOrganizationSchema,
    output: OrganizationDtoSchema,
    precheck: (self, data, ctx) => self.precheck.create(data, ctx),
  })
  async invoke(data: CreateOrganizationData): Validated<OrganizationDto> {
    const relatedContactIds = unique(data.contactIds);
    const relatedDealIds = unique(data.dealIds);
    const relatedTaskIds = unique(data.taskIds);

    const [previousContacts, previousDeals, previousTasks] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const organization = await this.repo.createOrganizationOrThrow(data);

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
      this.eventService.publish(DomainEvent.ORGANIZATION_CREATED, {
        entityId: organization.id,
        payload: organization,
      }),
    ]);

    return { ok: true as const, data: organization };
  }
}
