import type { P13nRepo } from "@/core/base/base-get.interactor";

import { Action, Resource } from "@/generated/prisma";

import { type AuditLogDto } from "./get-audit-logs-by-entity-id.interactor";

import { z } from "zod";

import { BaseGetRepo } from "@/core/base/base-get.interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const AuditLogDtoSchema = z.object({
  id: z.string(),
  event: z.string(),
  eventData: z.any(),
  createdAt: z.date(),
  user: z.object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
  }),
  entityId: z.string(),
});

export abstract class GetAuditLogsRepo extends BaseGetRepo<AuditLogDto> {}

@AllowInDemoMode
@TentantInteractor({ resource: Resource.auditLog, action: Action.readAll })
export class GetAuditLogsInteractor extends BaseGetInteractor<AuditLogDto> {
  constructor(repo: GetAuditLogsRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, {
      sortDescriptor: { field: "createdAt", direction: "desc" },
      pagination: { pageSize: 25, page: 1 },
    });
  }

  @Enforce(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(AuditLogDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
