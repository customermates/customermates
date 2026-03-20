import { Action, Resource } from "@/generated/prisma";

import { type AuditLogDto } from "./get-audit-logs-by-entity-id.interactor";

import { BaseGetRepo, P13nRepo } from "@/core/base/base-get.interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

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
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
