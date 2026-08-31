import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { getOperatorUsersAction } from "../actions";

export class OperatorUsersStore extends BaseDataViewStore<OperatorUserRowDto> {
  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "name" },
      { uid: "email", sortable: true },
      { uid: "workspace" },
      { uid: "status", sortable: true },
      { uid: "plan" },
      { uid: "subscription" },
      { uid: "operator" },
      { uid: "lastActiveAt", sortable: true },
      { uid: "createdAt", sortable: true },
      { uid: "credits" },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getOperatorUsersAction(params);
  }
}
