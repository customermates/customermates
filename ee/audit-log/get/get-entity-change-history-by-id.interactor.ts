import type { Data } from "@/core/validation/validation.utils";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { AuditLogDto } from "./get-audit-logs-by-entity-id.interactor";

import { z } from "zod";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { CloudOnly } from "@/core/decorators/cloud-only.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export const GetEntityChangeHistoryByIdSchema = z.object({
  entityId: z.uuid(),
});
export type GetEntityChangeHistoryByIdData = Data<typeof GetEntityChangeHistoryByIdSchema>;

export abstract class GetEntityChangeHistoryByIdAuditLogRepo {
  abstract getAuditLogsByEntityId(entityId: string): Promise<AuditLogDto[]>;
}

export abstract class GetEntityChangeHistoryByIdCustomColumnRepo {
  abstract findByEntityType(entityType: EntityType): Promise<CustomColumnDto[]>;
}

const ENTITY_TYPE_PREFIX_MAP: Record<string, EntityType> = {
  "contact.": EntityType.contact,
  "organization.": EntityType.organization,
  "deal.": EntityType.deal,
  "service.": EntityType.service,
  "task.": EntityType.task,
};

@CloudOnly
@AllowInDemoMode
@TenantInteractor({ resource: Resource.auditLog, action: Action.readAll })
export class GetEntityChangeHistoryByIdInteractor extends AuthenticatedInteractor<
  GetEntityChangeHistoryByIdData,
  { items: AuditLogDto[]; customColumns: CustomColumnDto[] }
> {
  constructor(
    private auditLogRepo: GetEntityChangeHistoryByIdAuditLogRepo,
    private customColumnRepo: GetEntityChangeHistoryByIdCustomColumnRepo,
  ) {
    super();
  }

  @Enforce(GetEntityChangeHistoryByIdSchema)
  @ValidateOutput(z.any())
  async invoke(
    data: GetEntityChangeHistoryByIdData,
  ): Promise<{ ok: true; data: { items: AuditLogDto[]; customColumns: CustomColumnDto[] } }> {
    const items = await this.auditLogRepo.getAuditLogsByEntityId(data.entityId);
    if (items.length === 0) return { ok: true as const, data: { items: [], customColumns: [] } };

    const entityType = Object.entries(ENTITY_TYPE_PREFIX_MAP).find(([prefix]) =>
      items[0].event.startsWith(prefix),
    )?.[1];
    const customColumns = entityType ? await this.customColumnRepo.findByEntityType(entityType) : [];

    return { ok: true as const, data: { items, customColumns } };
  }
}
