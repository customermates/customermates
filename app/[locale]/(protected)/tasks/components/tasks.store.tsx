import type { TaskDto } from "@/features/tasks/task.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { TableColumn } from "@/core/base/base-data-view.store";

import { EntityType, Resource } from "@/generated/prisma";

import { refreshTasksAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class TasksStore extends BaseDataViewStore<TaskDto> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, Resource.tasks, EntityType.task);
  }

  get canAccessContacts() {
    return this.rootStore.userStore.canAccess(Resource.contacts);
  }

  get canAccessOrganizations() {
    return this.rootStore.userStore.canAccess(Resource.organizations);
  }

  get canAccessDeals() {
    return this.rootStore.userStore.canAccess(Resource.deals);
  }

  get canAccessServices() {
    return this.rootStore.userStore.canAccess(Resource.services);
  }

  get columnsDefinition() {
    const columns: (TableColumn | false)[] = [
      { uid: "name", sortable: true },
      this.canAccessContacts && { uid: "contacts" },
      this.canAccessOrganizations && { uid: "organizations" },
      this.canAccessDeals && { uid: "deals" },
      this.canAccessServices && { uid: "services" },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label, sortable: true })),
      { uid: "users" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];

    return columns.filter((col): col is TableColumn => Boolean(col));
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await refreshTasksAction(params);
  }
}
