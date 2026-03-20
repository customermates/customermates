import type { TaskDto } from "@/features/tasks/task.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { XTableColumn } from "@/core/base/base-data-view.store";

import { EntityType, Resource } from "@/generated/prisma";

import { refreshTasksAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class TasksStore extends BaseDataViewStore<TaskDto> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, Resource.tasks, EntityType.task);
  }

  get columnsDefinition() {
    const columns: (XTableColumn | false)[] = [
      { uid: "name", sortable: true },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label })),
      { uid: "users" },
      { uid: "updatedAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];

    return columns.filter((col): col is XTableColumn => Boolean(col));
  }

  protected async refreshAction(params?: GetQueryParams) {
    return await refreshTasksAction(params);
  }
}
