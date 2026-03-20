import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { FindServicesByIdsRepo, validateServiceIds } from "../../../core/validation/validate-service-ids";

import { DeleteServiceRepo } from "./delete-service.repo";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { preserveTenantContext } from "@/core/decorators/tenant-context";

export const DeleteServiceSchema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const { di } = await import("@/core/dependency-injection/container");
    const serviceSet = new Set([data.id]);
    const validIdsSet = await preserveTenantContext(() => di.get(FindServicesByIdsRepo).findIds(serviceSet));
    validateServiceIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteServiceData = Data<typeof DeleteServiceSchema>;

@TentantInteractor({ resource: Resource.services, action: Action.delete })
export class DeleteServiceInteractor {
  constructor(
    private repo: DeleteServiceRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Validate(DeleteServiceSchema)
  async invoke(data: DeleteServiceData): Validated<string, DeleteServiceData> {
    const service = await this.repo.deleteServiceOrThrow(data.id);

    await Promise.all([
      this.eventService.publish(DomainEvent.SERVICE_DELETED, {
        entityId: service.id,
        payload: service,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);

    return { ok: true, data: data.id };
  }
}
