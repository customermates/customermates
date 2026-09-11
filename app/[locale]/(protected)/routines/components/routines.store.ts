import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";

import { getRoutinesAction } from "../actions";

import { Resource } from "@/generated/prisma";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class RoutinesStore extends BaseDataViewStore<RoutineDto> {
  constructor(rootStore: RootStore) {
    super(rootStore, Resource.routines);
  }

  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "name", sortable: true },
      { uid: "owner", sortable: false },
      { uid: "trigger", sortable: false },
      { uid: "status", sortable: false },
      { uid: "lastRunAt", sortable: true },
      { uid: "nextRunAt", sortable: true },
      { uid: "createdAt", sortable: true },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getRoutinesAction(params);
  }
}
