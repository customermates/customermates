import type { RootStore } from "@/core/stores/root.store";
import type { AuditLogDto } from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { action, makeObservable, observable } from "mobx";
import { Resource } from "@/generated/prisma";

import { BaseModalStore } from "@/core/base/base-modal.store";
import { getEntityChangeHistoryByIdAction } from "@/app/actions";

type EntityHistoryModalForm = {
  entityId: string;
};

export class EntityHistoryModalStore extends BaseModalStore<EntityHistoryModalForm> {
  items: AuditLogDto[] = [];
  customColumns: CustomColumnDto[] = [];

  constructor(public readonly rootStore: RootStore) {
    super(rootStore, { entityId: "" }, Resource.auditLog);

    makeObservable(this, {
      items: observable,
      customColumns: observable,
      loadByEntityId: action,
    });
  }

  loadByEntityId = async (entityId: string) => {
    this.onInitOrRefresh({ entityId });
    this.items = [];
    this.customColumns = [];
    this.open();
    this.setIsLoading(true);

    try {
      const result = await getEntityChangeHistoryByIdAction({ entityId });
      this.items = result.items;
      this.customColumns = result.customColumns;
    } finally {
      this.setIsLoading(false);
    }
  };
}
