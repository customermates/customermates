import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { AutomationListItemDto } from "@/features/automation-rules/automations-list.schema";

import { Resource } from "@/generated/prisma";
import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { actionData } from "@/core/utils/action-data";

import { getAutomationsListAction } from "../actions";

export class AutomationsStore extends BaseDataViewStore<AutomationListItemDto> {
  constructor(rootStore: RootStore) {
    super(rootStore, Resource.routines);
  }

  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "name", sortable: true },
      { uid: "sentence", sortable: false, label: this.t("Automations.columns.sentence") },
      { uid: "runsOn", sortable: false, label: this.t("Automations.columns.runsOn") },
      { uid: "lastRunAt", sortable: true },
      { uid: "runs30d", sortable: true, label: this.t("Automations.columns.runs30d") },
      { uid: "enabled", sortable: false, label: this.t("Automations.columns.enabled") },
      { uid: "owner", sortable: false },
      { uid: "createdAt", sortable: true },
    ];
  }

  protected async refreshAction(params?: GetQueryParams) {
    return actionData(getAutomationsListAction(params));
  }
}
