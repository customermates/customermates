import type { EventService } from "@/features/event/event.service";
import type { UserService } from "@/features/user/user.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { DomainEvent } from "@/features/event/domain-events";
import { EXPORT_ROW_LIMIT } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

const READ_RESOURCE: Record<EntityType, Resource> = {
  [EntityType.contact]: Resource.contacts,
  [EntityType.organization]: Resource.organizations,
  [EntityType.deal]: Resource.deals,
  [EntityType.service]: Resource.services,
  [EntityType.task]: Resource.tasks,
};

export const RecordExportAuditSchema = z.object({
  entityType: z.enum(EntityType),
  rowCount: z.number().int().min(0).max(EXPORT_ROW_LIMIT),
  truncated: z.boolean(),
  scope: z.enum(["selection", "view"]),
});

export type RecordExportAuditData = Data<typeof RecordExportAuditSchema>;

@AllowInDemoMode
@TenantInteractor()
export class RecordExportAuditInteractor extends AuthenticatedInteractor<RecordExportAuditData, null> {
  constructor(
    private userService: UserService,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(RecordExportAuditSchema)
  async invoke(data: RecordExportAuditData): Validated<null> {
    const resource = READ_RESOURCE[data.entityType];

    const readOwn = await this.userService.hasPermission(resource, Action.readOwn);

    if (!readOwn) await this.userService.hasPermissionOrThrow(resource, Action.readAll);

    await this.eventService.publish(DomainEvent.RECORDS_EXPORTED, {
      entityId: this.companyId,
      payload: data,
    });

    return { ok: true as const, data: null };
  }
}
