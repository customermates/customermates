import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { FindDealsByIdsRepo } from "../../deals/find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { type ServiceDto } from "../service.schema";

import { BaseCreateServiceSchema } from "./create-service-base.schema";
import { CreateServiceRepo } from "./create-service.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { GetUnscopedDealRepo } from "@/features/deals/get-unscoped-deal.repo";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { unique } from "@/core/utils/unique";

export const CreateServiceSchema = BaseCreateServiceSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");

  const userSet = new Set(data.userIds);
  const dealSet = new Set(data.dealIds);

  const [validUserIdsSet, validDealIdsSet, allColumns] = await preserveTenantContext(() =>
    Promise.all([
      di.get(FindUsersByIdsRepo).findIds(userSet),
      di.get(FindDealsByIdsRepo).findIds(dealSet),
      di.get(FindCustomColumnRepo).findByEntityType(EntityType.service),
    ]),
  );

  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type CreateServiceData = Data<typeof CreateServiceSchema>;

@TentantInteractor({
  resource: Resource.services,
  action: Action.create,
})
export class CreateServiceInteractor {
  constructor(
    private repo: CreateServiceRepo,
    private dealsRepo: GetUnscopedDealRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(CreateServiceSchema)
  async invoke(data: CreateServiceData): Validated<ServiceDto, CreateServiceData> {
    const relatedDealIds = unique(data.dealIds);

    const previousDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

    const service = await this.repo.createServiceOrThrow(data);

    const currentDeals = await this.dealsRepo.getManyOrThrowUnscoped(relatedDealIds);

    await Promise.all([
      ...currentDeals.map((deal, index) =>
        this.eventService.publish(DomainEvent.DEAL_UPDATED, {
          entityId: deal.id,
          payload: {
            deal,
            changes: calculateChanges(previousDeals[index], deal),
          },
        }),
      ),
      this.eventService.publish(DomainEvent.SERVICE_CREATED, {
        entityId: service.id,
        payload: service,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: service };
  }
}
