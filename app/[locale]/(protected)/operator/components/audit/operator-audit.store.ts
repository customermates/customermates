import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { OperatorAuditRowDto } from "@/ee/operator/operator-lists.schema";

import { getOperatorAuditAction } from "../../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class OperatorAuditStore extends BaseDataViewStore<OperatorAuditRowDto> {
  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "createdAt", sortable: true },
      { uid: "source" },
      { uid: "action" },
      { uid: "actor" },
      { uid: "workspace" },
      { uid: "target" },
      { uid: "reason" },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getOperatorAuditAction(params);
  }
}
