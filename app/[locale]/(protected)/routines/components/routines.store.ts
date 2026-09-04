import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { getRoutinesAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class RoutinesStore extends BaseDataViewStore<RoutineDto> {
  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "name", sortable: true },
      { uid: "owner", sortable: false },
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
