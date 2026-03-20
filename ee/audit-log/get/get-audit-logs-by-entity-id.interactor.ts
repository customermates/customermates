import type { DomainEvent, DomainEventMap } from "@/features/event/domain-events";

import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data } from "@/core/validation/validation.utils";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { UserReferenceSchema } from "@/core/base/base-entity.schema";

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

@TentantInteractor({ resource: Resource.auditLog, action: Action.readAll })
export class GetAuditLogsByEntityIdInteractor {
  constructor(private repo: GetAuditLogsByEntityIdRepo) {}

  @Enforce(GetAuditLogsByEntityIdSchema)
  async invoke(data: GetAuditLogsByEntityIdData): Promise<AuditLogDto[]> {
    const auditLogs = await this.repo.getAuditLogsByEntityId(data.entityId);

    return auditLogs;
  }
}
