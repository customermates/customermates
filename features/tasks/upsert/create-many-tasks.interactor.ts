import type { CreateTaskRepo } from "./create-task.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideServiceRepo } from "@/features/services/get-company-wide-service.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { TaskWritePrecheckInteractor } from "./task-write-precheck.interactor";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { validateNotes } from "@/core/validation/validate-notes";
import { type TaskDto, TaskDtoSchema } from "../task.schema";

import { BaseCreateTaskSchema } from "./create-task-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { buildRelationChangePublishes } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateManyTasksSchema = z
  .object({
    tasks: z.array(BaseCreateTaskSchema).min(1).max(100),
  })
  .superRefine((data, ctx) => {
    for (let i = 0; i < data.tasks.length; i++) {
      const task = data.tasks[i];
      task.notes = validateNotes(task.notes, ctx, ["tasks", i, "notes"]);
    }
  });
export type CreateManyTasksData = Data<typeof CreateManyTasksSchema>;

@TenantInteractor({
  resource: Resource.tasks,
  action: Action.create,
})
export class CreateManyTasksInteractor extends AuthenticatedInteractor<CreateManyTasksData, TaskDto[]> {
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
    input: CreateManyTasksSchema,
    output: TaskDtoSchema,
    precheck: (self, data, ctx) => self.precheck.createMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: CreateManyTasksData): Validated<TaskDto[]> {
    const relatedContactIds = unique(data.tasks.flatMap((task) => task.contactIds));
    const relatedOrganizationIds = unique(data.tasks.flatMap((task) => task.organizationIds));
    const relatedDealIds = unique(data.tasks.flatMap((task) => task.dealIds));
    const relatedServiceIds = unique(data.tasks.flatMap((task) => task.serviceIds));

    const [previousContacts, previousOrganizations, previousDeals, previousServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
    ]);

    const tasks = await Promise.all(data.tasks.map((taskData) => this.repo.createTaskOrThrow(taskData)));

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
      ...tasks.map((task) =>
        this.eventService.publish(DomainEvent.TASK_CREATED, {
          entityId: task.id,
          payload: task,
        }),
      ),
    ]);

    return { ok: true as const, data: tasks };
  }
}
