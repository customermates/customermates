import { Resource, Action, EntityType } from "@/generated/prisma";

import { FindCustomColumnRepo } from "../../custom-column/find-custom-column.repo";
import { validateCustomFieldValues } from "../../../core/validation/validate-custom-field-values";
import { FindUsersByIdsRepo } from "../../user/find-users-by-ids.repo";
import { validateUserIds } from "../../../core/validation/validate-user-ids";
import { FindDealsByIdsRepo } from "../../deals/find-deals-by-ids.repo";
import { validateDealIds } from "../../../core/validation/validate-deal-ids";
import { FindServicesByIdsRepo } from "../find-services-by-ids.repo";
import { validateServiceIds } from "../../../core/validation/validate-service-ids";
import { type ServiceDto } from "../service.schema";

import { BaseUpdateServiceSchema } from "./update-service-base.schema";
import { UpdateServiceRepo } from "./update-service.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";
import { validateNotes } from "@/core/validation/validate-notes";

export const UpdateServiceSchema = BaseUpdateServiceSchema.superRefine(async (data, ctx) => {
  const { di } = await import("@/core/dependency-injection/container");

  const userSet = new Set(data.userIds ?? []);
  const dealSet = new Set(data.dealIds ?? []);
  const serviceSet = new Set([data.id]);

  const [validUserIdsSet, validDealIdsSet, validServiceIdsSet, allColumns] = await preserveTenantContext(() =>
    Promise.all([
      di.get(FindUsersByIdsRepo).findIds(userSet),
      di.get(FindDealsByIdsRepo).findIds(dealSet),
      di.get(FindServicesByIdsRepo).findIds(serviceSet),
      di.get(FindCustomColumnRepo).findByEntityType(EntityType.service),
    ]),
  );

  validateServiceIds(data.id, validServiceIdsSet, ctx, ["id"]);
  validateUserIds(data.userIds, validUserIdsSet, ctx, ["userIds"]);
  validateDealIds(data.dealIds, validDealIdsSet, ctx, ["dealIds"]);
  validateCustomFieldValues(data.customFieldValues, allColumns, ctx, ["customFieldValues"]);
  data.notes = validateNotes(data.notes, ctx, ["notes"]);
});
export type UpdateServiceData = Data<typeof UpdateServiceSchema>;

@TentantInteractor({
  resource: Resource.services,
  action: Action.update,
})
export class UpdateServiceInteractor {
  constructor(
    private repo: UpdateServiceRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(UpdateServiceSchema)
  @Transaction
  async invoke(data: UpdateServiceData): Validated<ServiceDto, UpdateServiceData> {
    const previousService = await this.repo.getServiceByIdOrThrow(data.id);
    const service = await this.repo.updateServiceOrThrow(data);

    const changes = calculateChanges(previousService, service);

    await Promise.all([
      this.eventService.publish(DomainEvent.SERVICE_UPDATED, {
        entityId: service.id,
        payload: {
          service,
          changes,
        },
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: service };
  }
}
