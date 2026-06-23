import type { UpdateContactRepo } from "./update-contact.repo";
import type { EventService } from "@/features/event/event.service";
import type { GetCompanyWideDealRepo } from "@/features/deals/get-company-wide-deal.repo";
import type { GetCompanyWideOrganizationRepo } from "@/features/organizations/get-company-wide-organization.repo";
import type { GetCompanyWideTaskRepo } from "@/features/tasks/get-company-wide-task.repo";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ContactWritePrecheckInteractor } from "./contact-write-precheck.interactor";

import { Resource, Action } from "@/generated/prisma";

import { type ContactDto, ContactDtoSchema } from "../contact.schema";

import { BaseUpdateContactSchema } from "./update-contact-base.schema";
import { validateIdentifiers } from "./validate-identifiers";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { buildRelationChangePublishes, calculateChanges } from "@/core/utils/calculate-changes";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateNotes } from "@/core/validation/validate-notes";
import { unique } from "@/core/utils/unique";

export const UpdateContactSchema = BaseUpdateContactSchema.superRefine((data, ctx) => {
  validateIdentifiers(data.identifiers, ctx, ["identifiers"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateContactData = Data<typeof UpdateContactSchema>;

@TenantInteractor({
  resource: Resource.contacts,
  action: Action.update,
})
export class UpdateContactInteractor extends AuthenticatedInteractor<UpdateContactData, ContactDto> {
  constructor(
    private contactsRepo: UpdateContactRepo,
    private organizationsRepo: GetCompanyWideOrganizationRepo,
    private dealsRepo: GetCompanyWideDealRepo,
    private tasksRepo: GetCompanyWideTaskRepo,
    private eventService: EventService,
    private precheck: ContactWritePrecheckInteractor,
  ) {
    super();
  }

  @Write({
    input: UpdateContactSchema,
    output: ContactDtoSchema,
    precheck: (self, data, ctx) => self.precheck.update(data, ctx),
  })
  async invoke(data: UpdateContactData): Validated<ContactDto> {
    const previousContact = await this.contactsRepo.getOrThrowCompanyWide(data.id);

    const relatedOrganizationIds = unique(
      previousContact.organizations.map((it) => it.id),
      data.organizationIds,
    );
    const relatedDealIds = unique(
      previousContact.deals.map((it) => it.id),
      data.dealIds,
    );
    const relatedTaskIds = unique(
      previousContact.tasks.map((it) => it.id),
      data.taskIds,
    );

    const [previousOrganizations, previousDeals, previousTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const contact = await this.contactsRepo.updateContactOrThrow(data);

    const [currentOrganizations, currentDeals, currentTasks] = await Promise.all([
      this.organizationsRepo.getManyOrThrowCompanyWide(relatedOrganizationIds),
      this.dealsRepo.getManyOrThrowCompanyWide(relatedDealIds),
      this.tasksRepo.getManyOrThrowCompanyWide(relatedTaskIds),
    ]);

    const changes = calculateChanges(previousContact, contact);

    await Promise.all([
      ...buildRelationChangePublishes(
        previousOrganizations,
        currentOrganizations,
        "contacts",
        (organization, changes) =>
          this.eventService.publish(DomainEvent.ORGANIZATION_UPDATED, {
            entityId: organization.id,
            payload: {
              organization,
              changes,
            },
          }),
      ),
      ...buildRelationChangePublishes(previousDeals, currentDeals, "contacts", (deal, changes) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes,
          },
        }),
      ),
      ...buildRelationChangePublishes(previousTasks, currentTasks, "contacts", (task, changes) =>
        this.eventService.publish(DomainEvent.TASK_UPDATED, {
          entityId: task.id,
          payload: {
            task,
            changes,
          },
        }),
      ),
      this.eventService.publish(DomainEvent.CONTACT_UPDATED, {
        entityId: contact.id,
        payload: {
          contact,
          changes,
        },
      }),
    ]);

    return { ok: true as const, data: contact };
  }
}
