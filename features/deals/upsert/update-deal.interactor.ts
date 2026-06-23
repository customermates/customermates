import type { UpdateDealRepo } from "./update-deal.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideContactRepo } from "@/features/contacts/get-company-wide-contact.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideServiceRepo } from "@/features/services/get-company-wide-service.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { DealWritePrecheckInteractor } from "./deal-write-precheck.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type DealDto, DealDtoSchema } from "../deal.schema";

import { BaseUpdateDealSchema } from "./update-deal-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";

export const UpdateDealSchema = BaseUpdateDealSchema.superRefine((data, ctx) => {
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateDealData = Data<typeof UpdateDealSchema>;

@TenantInteractor({
  resource: Resource.deals,
  action: Action.update,
})
export class UpdateDealInteractor extends AuthenticatedInteractor<UpdateDealData, DealDto> {
  constructor(
    private dealsRepo: UpdateDealRepo,
    private organizationsRepo: GetCompanyWideOrganizationRepo,
    private contactsRepo: GetCompanyWideContactRepo,
    private servicesRepo: GetCompanyWideServiceRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
    private precheck: DealWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: UpdateDealSchema,
    output: DealDtoSchema,
    precheck: (self, data, ctx) => self.precheck.update(data, ctx),
  })
  async invoke(data: UpdateDealData): Validated<DealDto> {
    const previousDeal = await this.dealsRepo.getOrThrowCompanyWide(data.id);

    const relatedOrganizationIds = unique(
      previousDeal.organizations.map((it) => it.id),
      data.organizationIds,
    );
    const relatedContactIds = unique(
      previousDeal.contacts.map((it) => it.id),
      data.contactIds,
    );
    const relatedServiceIds = unique(
      previousDeal.services.map((it) => it.id),
      data.services?.map((s) => s.serviceId),
    );
    const relatedTaskIds = unique(
      previousDeal.tasks.map((it) => it.id),
      data.taskIds,
    );

    const [previousOrganizations, previousContacts, previousServices, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const deal = await this.dealsRepo.updateDealOrThrow(data);

    const [currentOrganizations, currentContacts, currentServices, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.contactsRepo.getManyOrThrowCompanyWide(relatedContactIds),
      this.servicesRepo.getManyOrThrowCompanyWide(relatedServiceIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const changes = calculateChanges(previousDeal, deal);

    await Promise.all([
      ...buildRelationChangePublishes(previousOrganizations, currentOrganizations, "deals", (organization, changes) =>
        this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
          entityId: organization.id,
          payload: {
            organization,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousContacts, currentContacts, "deals", (contact, changes) =>
        this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
          entityId: contact.id,
          payload: {
            contact,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousServices, currentServices, "deals", (service, changes) =>
        this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
          entityId: service.id,
          payload: {
            service,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousTasks, currentTasks, "deals", (task, changes) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes,
          },
        }),
      ),
      this.eventService.publish(DomainEvent.DEAL_UPDATED, {
        entityId: deal.id,
        payload: {
          deal,
          changes,
        },
      }),
    ]);

    return { ok: true as const, data: deal };
  }
}
