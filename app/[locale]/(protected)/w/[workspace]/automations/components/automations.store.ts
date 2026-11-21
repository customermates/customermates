import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type {
  AutomationListItemDto,
  AutomationListNotShown,
} from "@/features/automation-rules/automations-list.schema";

import { makeObservable, observable } from "mobx";

import { Resource } from "@/generated/prisma";
import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { actionData } from "@/core/utils/action-data";

import { getAutomationsListAction } from "../actions";

export type AutomationsListResult = GetResult<AutomationListItemDto> & {
  truncated?: boolean;
  notShown?: AutomationListNotShown;
};

export class AutomationsStore extends BaseDataViewStore<AutomationListItemDto> {
  truncated = false;

  constructor(rootStore: RootStore) {
    super(rootStore, Resource.routines);

    makeObservable(this, { truncated: observable });
  }

  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "name", sortable: true },
      { uid: "starts", sortable: false, label: this.t("Automations.columns.starts") },
      { uid: "steps", sortable: false, label: this.t("Automations.columns.steps") },
      { uid: "runsOn", sortable: false, label: this.t("Automations.columns.runsOn") },
      { uid: "lastRunAt", sortable: true },
      { uid: "runs30d", sortable: true, label: this.t("Automations.columns.runs30d") },
      { uid: "enabled", sortable: false, label: this.t("Automations.columns.enabled") },
      { uid: "owner", sortable: false },
      { uid: "createdAt", sortable: true },
    ];
  }

  override setItems(args: AutomationsListResult): void {
    super.setItems(args);
    if (args.grouping?.partial) return;
    const notShown = (args.notShown?.rules ?? 0) + (args.notShown?.routines ?? 0);
    this.truncated = args.truncated === true || notShown > 0;
  }

  protected async refreshAction(params?: GetQueryParams) {
    return actionData(getAutomationsListAction(params));
  }
}
