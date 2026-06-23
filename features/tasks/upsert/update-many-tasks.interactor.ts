import type { UpdateTaskRepo } from "./update-task.repo";
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

import { BaseUpdateTaskSchema } from "./update-task-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { unique } from "@/core/utils/unique";

export const UpdateManyTasksSchema = z
  .object({
    tasks: z.array(BaseUpdateTaskSchema).min(1).max(100),
  })
  .superRefine((data, ctx) => {
    for (let i = 0; i < data.tasks.length; i++) {
      const task = data.tasks[i];
      task.notes = validateNotes(task.notes, ctx, ["tasks", i, "notes"]);
    }
  });
export type UpdateManyTasksData = Data<typeof UpdateManyTasksSchema>;

@TenantInteractor({
  resource: Resource.tasks,
  action: Action.update,
})
export class UpdateManyTasksInteractor extends AuthenticatedInteractor<UpdateManyTasksData, TaskDto[]> {
  constructor(
    private repo: UpdateTaskRepo,
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
    input: UpdateManyTasksSchema,
    output: TaskDtoSchema,
    precheck: (self, data, ctx) => self.precheck.updateMany(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: UpdateManyTasksData): Validated<TaskDto[]> {
    const previousTasks = await this.repo.getManyOrThrowCompanyWide(data.tasks.map((t) => t.id));

    const relatedContactIds = unique(
      previousTasks.flatMap((t) => t.contacts.map((it) => it.id)),
      data.tasks.flatMap((t) => t.contactIds ?? []),
    );
    const relatedOrganizationIds = unique(
      previousTasks.flatMap((t) => t.organizations.map((it) => it.id)),
      data.tasks.flatMap((t) => t.organizationIds ?? []),
    );
    const relatedDealIds = unique(
      previousTasks.flatMap((t) => t.deals.map((it) => it.id)),
      data.tasks.flatMap((t) => t.dealIds ?? []),
    );
    const relatedServiceIds = unique(
      previousTasks.flatMap((t) => t.services.map((it) => it.id)),
      data.tasks.flatMap((t) => t.serviceIds ?? []),
    );

    const [previousContacts, previousOrganizations, previousDeals, previousServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
    ]);

    const tasks = await Promise.all(data.tasks.map((taskData) => this.repo.updateTaskOrThrow(taskData)));

    const [currentContacts, currentOrganizations, currentDeals, currentServices] = await Promise.all([
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
    ]);

    const previousTasksMap = new Map(previousTasks.map((t) => [t.id, t]));

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
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes: calculateChanges(previousTasksMap.get(task.id), task),
          },
        }),
      ),
    ]);

    return { ok: true as const, data: tasks };
  }
}
