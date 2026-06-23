import type { CreateTaskRepo } from "./create-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideServiceRepo } from "@/features/services/get-company-wide-service.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { TaskWritePrecheckInteractor } from "./task-write-precheck.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { BaseCreateTaskSchema } from "./create-task-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";
import { validateNotes } from "@/core/validation/validate-notes";

export const CreateTaskSchema = BaseCreateTaskSchema.superRefine((data, ctx) => {
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateTaskData = Data<typeof CreateTaskSchema>;

@TenantInteractor({
  resource: Resource.tasks,
  action: Action.create,
})
export class CreateTaskInteractor extends AuthenticatedInteractor<CreateTaskData, TaskDto> {
  constructor(
    private repo: CreateTaskRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private organizationsRepo: GetCompanyWideOrganizationRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private servicesRepo: GetCompanyWideServiceRepo,
    private eventService: EventService,
    private precheck: TaskWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: CreateTaskSchema,
    output: TaskDtoSchema,
    precheck: (self, data, ctx) => self.precheck.create(data, ctx),
  })
  async invoke(data: CreateTaskData): Validated<TaskDto> {
    const relatedContactIds = unique(data.contactIds);
    const relatedOrganizationIds = unique(data.organizationIds);
    const relatedDealIds = unique(data.dealIds);
    const relatedServiceIds = unique(data.serviceIds);

    const [previousContacts, previousOrganizations, previousDeals, previousServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
    ]);

    const task = await this.repo.createTaskOrThrow(data);

    const [currentContacts, currentOrganizations, currentDeals, currentServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
    ]);

    await Promise.all([
      ...buildRelationChangePublishes(previousContacts, currentContacts, "tasks", (contact, changes) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousOrganizations, currentOrganizations, "tasks", (organization, changes) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousDeals, currentDeals, "tasks", (deal, changes) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousServices, currentServices, "tasks", (service, changes) =>
        this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes,
          },
        }),
      ),
      this.eventService.publish(DomainEvent.TASK_CREATED, {
        entityId: task.id,
        payload: task,
      }),
    ]);

    return { ok: true as const, data: task };
  }
}
