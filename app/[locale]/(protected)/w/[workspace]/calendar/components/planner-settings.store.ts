import type { PlannerConfig, PlannerQuery } from "@/features/planner/planner.schema";
import type { PlannerResult } from "@/features/planner/read-planner.interactor";

import { action, makeObservable, observable, runInAction } from "mobx";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { actionData } from "@/core/utils/action-data";
import { Debouncer } from "@/core/utils/debounce";
import { readPlannerAction, savePlannerAction } from "../actions";

const SAVE_DELAY_MS = 1000;

export class PlannerSettingsStore {
  config: PlannerConfig;
  data: PlannerResult | null = null;
  refreshing = false;
  failed = false;
  private request = 0;
  private unsaved = false;
  private readonly saver = new Debouncer(SAVE_DELAY_MS);

  constructor(config: PlannerConfig) {
    this.config = config;
    makeObservable(this, {
      config: observable.ref,
      data: observable.ref,
      refreshing: observable,
      failed: observable,
      setConfig: action,
    });
  }

  setConfig = (update: (current: PlannerConfig) => PlannerConfig, { persist = true }: { persist?: boolean } = {}) => {
    this.config = update(this.config);
    if (!persist) return;
    this.unsaved = true;
    this.saver.run(this.flush);
  };

  load = async (query: PlannerQuery) => {
    const current = ++this.request;
    runInAction(() => {
      this.refreshing = true;
      this.failed = false;
    });
    try {
      const data = await actionData(readPlannerAction(query));
      if (current === this.request) runInAction(() => (this.data = data));
    } catch (error) {
      if (current !== this.request) return;
      runInAction(() => (this.failed = true));
      reportApplicationError(error);
    } finally {
      if (current === this.request) runInAction(() => (this.refreshing = false));
    }
  };

  cancel = () => {
    this.request += 1;
  };

  flush = () => {
    this.saver.cancel();
    if (!this.unsaved) return;
    this.unsaved = false;
    void actionData(savePlannerAction(this.config)).catch(reportApplicationError);
  };
}
