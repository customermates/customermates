import type { RootStore } from "@/core/stores/root.store";
import type { XTableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { AuditLogDto } from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";

import { Resource } from "@/generated/prisma";

import { getAuditLogsAction } from "../../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class AuditLogsStore extends BaseDataViewStore<AuditLogDto> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, Resource.auditLog);
  }

  get columnsDefinition(): XTableColumn[] {
    return [
      { uid: "name" },
      { uid: "event" },
      { uid: "entityId" },
      { uid: "user" },
      { uid: "createdAt", sortable: true },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getAuditLogsAction(params);
  }
}
