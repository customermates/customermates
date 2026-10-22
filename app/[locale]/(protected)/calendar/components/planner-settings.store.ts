import type { PlannerConfig } from "@/features/planner/planner.schema";

import { action, makeObservable, observable } from "mobx";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { actionData } from "@/core/utils/action-data";
import { Debouncer } from "@/core/utils/debounce";
import { savePlannerAction } from "../actions";

const SAVE_DELAY_MS = 1000;

export class PlannerSettingsStore {
  config: PlannerConfig;
  private unsaved = false;
  private readonly saver = new Debouncer(SAVE_DELAY_MS);

  constructor(config: PlannerConfig) {
    this.config = config;
    makeObservable(this, { config: observable.ref, setConfig: action });
  }

  setConfig = (update: (current: PlannerConfig) => PlannerConfig, { persist = true }: { persist?: boolean } = {}) => {
    this.config = update(this.config);
    if (!persist) return;
    this.unsaved = true;
    this.saver.run(this.flush);
  };

  flush = () => {
    this.saver.cancel();
    if (!this.unsaved) return;
    this.unsaved = false;
    void actionData(savePlannerAction(this.config)).catch(reportApplicationError);
  };
}
