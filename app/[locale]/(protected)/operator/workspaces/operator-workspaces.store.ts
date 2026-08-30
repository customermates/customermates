import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { getOperatorWorkspacesAction } from "../actions";

export class OperatorWorkspacesStore extends BaseDataViewStore<OperatorWorkspaceRowDto> {
  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "workspace" },
      { uid: "owner" },
      { uid: "plan" },
      { uid: "subscription" },
      { uid: "members" },
      { uid: "allowance" },
      { uid: "createdAt", sortable: true },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getOperatorWorkspacesAction(params);
  }
}
