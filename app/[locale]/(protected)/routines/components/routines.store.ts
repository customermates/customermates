import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { Resource } from "@/generated/prisma";

import { getRoutinesAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class RoutinesStore extends BaseDataViewStore<RoutineDto> {
  constructor(rootStore: RootStore) {
    super(rootStore, Resource.api);
  }

  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "name", sortable: true },
      { uid: "trigger", sortable: false },
      { uid: "status", sortable: false },
      { uid: "lastRun", sortable: false },
      { uid: "nextRunAt", sortable: true },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getRoutinesAction(params);
  }
}
