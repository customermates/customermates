import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { FindContactsByIdsRepo } from "../../contacts/find-contacts-by-ids.repo";
import { validateContactIds } from "../../contacts/validate-contact-ids";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { FindDealsByIdsRepo } from "../../deals/find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { type OrganizationDto } from "../organization.schema";

import { BaseCreateOrganizationSchema } from "./create-organization-base.schema";
import { CreateOrganizationRepo } from "./create-organization.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";

export const CreateOrganizationSchema = BaseCreateOrganizationSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");

  const contactSet = new Set(data.contactIds);
  const userSet = new Set(data.userIds);
  const dealSet = new Set(data.dealIds);

  const [validContactIdsSet, validUserIdsSet, validDealIdsSet, allColumns] = await preserveTenantContext(() =>
    Promise.all([
      di.get(FindContactsByIdsRepo).findIds(contactSet),
      di.get(FindUsersByIdsRepo).findIds(userSet),
      di.get(FindDealsByIdsRepo).findIds(dealSet),
      di.get(FindCustomColumnRepo).findByEntityType(EntityType.organization),
    ]),
  );

  validateContactIds(data.contactIds, validContactIdsSet, ctx, ["contactIds"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateOrganizationData = Data<typeof CreateOrganizationSchema>;

@TentantInteractor({
  resource: Resource.organizations,
  action: Action.create,
})
export class CreateOrganizationInteractor {
  constructor(
    private repo: CreateOrganizationRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(CreateOrganizationSchema)
  async invoke(data: CreateOrganizationData): Validated<OrganizationDto, CreateOrganizationData> {
    const organization = await this.repo.createOrganizationOrThrow(data);

    await Promise.all([
      this.eventService.publish(DomainEvent.ORGANIZATION_CREATED, {
        entityId: organization.id,
        payload: organization,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: organization };
  }
}
