import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { ServiceDto } from "@/features/services/service.schema";

import { EntityType, Resource } from "@/generated/prisma";

import { getServicesAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class ServicesStore extends BaseDataViewStore<ServiceDto> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, Resource.services, EntityType.service);
  }

  get canAccessDeals() {
    return this.rootStore.userStore.canAccess(Resource.deals);
  }

  get canAccessTasks() {
    return this.rootStore.userStore.canAccess(Resource.tasks);
  }

  get columnsDefinition() {
    const columns: (TableColumn | false)[] = [
      { uid: "name", sortable: true },
      { uid: "amount", sortable: true },
      this.canAccessDeals && { uid: "deals" },
      this.canAccessTasks && { uid: "tasks" },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label, sortable: true })),
      { uid: "users" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];

    return columns.filter((col): col is TableColumn => Boolean(col));
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await getServicesAction(params);
  }
}
