import type { PlannerConfig } from "@/features/planner/planner.schema";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, runInAction, toJS } from "mobx";
import { BaseFormStore } from "@/core/base/base-form.store";
import { actionData } from "@/core/utils/action-data";
import { savePlannerAction } from "../actions";

export class PlannerSettingsStore extends BaseFormStore<PlannerConfig> {
  constructor(root: RootStore, config: PlannerConfig) {
    super(root, config);
    makeObservable(this, { setConfig: action });
  }
  setConfig = (update: PlannerConfig | ((current: PlannerConfig) => PlannerConfig)) => {
    this.form = typeof update === "function" ? update(toJS(this.form)) : update;
  };
  override onSubmit = async () => {
    if (this.isLoading) return;
    const snapshot = toJS(this.form);
    this.setIsLoading(true);
    try {
      await actionData(savePlannerAction(snapshot));
      runInAction(() => {
        this.savedState = snapshot;
      });
    } finally {
      this.setIsLoading(false);
    }
  };
}
