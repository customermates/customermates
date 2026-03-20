import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { FindDealsByIdsRepo } from "../../deals/find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { FindOrganizationsByIdsRepo } from "../../organizations/find-organizations-by-ids.repo";
import { validateOrganizationIds } from "../../../core/validation/validate-organization-ids";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { type ContactDto } from "../contact.schema";

import { CreateContactRepo } from "./create-contact.repo";
import { BaseCreateContactSchema } from "./create-contact-base.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";

export const CreateContactSchema = BaseCreateContactSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");

  const allOrgIds = new Set(data.organizationIds);
  const allUserIds = new Set(data.userIds);
  const allDealIds = new Set(data.dealIds);

  const [validOrgIdsSet, validUserIdsSet, validDealIdsSet, allColumns] = await preserveTenantContext(() =>
    Promise.all([
      di.get(FindOrganizationsByIdsRepo).findIds(allOrgIds),
      di.get(FindUsersByIdsRepo).findIds(allUserIds),
      di.get(FindDealsByIdsRepo).findIds(allDealIds),
      di.get(FindCustomColumnRepo).findByEntityType(EntityType.contact),
    ]),
  );

  validateOrganizationIds(data.organizationIds, validOrgIdsSet, ctx, ["organizationIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateContactData = Data<typeof CreateContactSchema>;

@TentantInteractor({
  resource: Resource.contacts,
  action: Action.create,
})
export class CreateContactInteractor {
  constructor(
    private repo: CreateContactRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(CreateContactSchema)
  async invoke(data: CreateContactData): Validated<ContactDto, CreateContactData> {
    const contact = await this.repo.createContactOrThrow(data);

    await Promise.all([
      this.eventService.publish(DomainEvent.CONTACT_CREATED, {
        entityId: contact.id,
        payload: contact,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: contact };
  }
}
