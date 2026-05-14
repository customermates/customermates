import type { DomainEvent, DomainEventMap } from "@/features/event/domain-events";
import type { Data } from "@/core/validation/validation.utils";
import type { UserReferenceSchema } from "@/core/base/base-entity.schema";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { CloudOnly } from "@/core/decorators/cloud-only.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export type AuditLogDto = {
  id: string;
  event: DomainEvent;
  eventData: DomainEventMap[DomainEvent];
  createdAt: Date;
  user: Data<typeof UserReferenceSchema>;
  entityId: string;
};

export const GetAuditLogsByEntityIdSchema = z.object({
  entityId: z.uuid(),
});

export type GetAuditLogsByEntityIdData = Data<typeof GetAuditLogsByEntityIdSchema>;

export abstract class GetAuditLogsByEntityIdRepo {
  abstract getAuditLogsByEntityId(entityId: string): Promise<AuditLogDto[]>;
}

@CloudOnly
@TenantInteractor({ resource: Resource.auditLog, action: Action.readAll })
export class GetAuditLogsByEntityIdInteractor extends AuthenticatedInteractor<
  GetAuditLogsByEntityIdData,
  AuditLogDto[]
> {
  constructor(private repo: GetAuditLogsByEntityIdRepo) {
    super();
  }

  @Enforce(GetAuditLogsByEntityIdSchema)
  @ValidateOutput(z.any())
  async invoke(data: GetAuditLogsByEntityIdData): Promise<{ ok: true; data: AuditLogDto[] }> {
    const auditLogs = await this.repo.getAuditLogsByEntityId(data.entityId);

    return { ok: true as const, data: auditLogs };
  }
}
