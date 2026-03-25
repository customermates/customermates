import type { RootStore } from "@/core/stores/root.store";
import type { AuditLogDto } from "@/ee/audit-log/get/get-audit-logs-by-entity-id.interactor";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { action, makeObservable, observable } from "mobx";

import { BaseModalStore } from "@/core/base/base-modal.store";

export class EntityHistoryDetailsModalStore extends BaseModalStore {
  item: AuditLogDto | null = null;
  customColumns: CustomColumnDto[] = [];

  constructor(public readonly rootStore: RootStore) {
    super(rootStore, {});

    makeObservable(this, {
      item: observable,
      customColumns: observable,
      clear: action,
      openWithData: action,
    });
  }

  openWithData = (item: AuditLogDto, customColumns: CustomColumnDto[]) => {
    this.item = item;
    this.customColumns = customColumns;
    this.open();
  };

  clear = () => {
    this.item = null;
    this.customColumns = [];
  };
}
