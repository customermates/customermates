import { action, makeObservable, observable, runInAction } from "mobx";
import type { RecordModel } from "@/features/records/record-model.schema";
import { getRecordModelAction } from "../../../records/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";

export class DataModelStore {
  model: RecordModel;
  refreshFailed = false;
  isRefreshing = false;
  private sequence = 0;
  constructor(model: RecordModel) {
    this.model = model;
    makeObservable(this, {
      model: observable.ref,
      refreshFailed: observable,
      isRefreshing: observable,
      hydrate: action,
    });
  }
  hydrate = (model: RecordModel) => {
    if (model.revision >= this.model.revision) this.model = model;
  };
  refresh = async () => {
    const sequence = ++this.sequence;
    runInAction(() => {
      this.isRefreshing = true;
      this.refreshFailed = false;
    });
    try {
      const model = await getRecordModelAction();
      if (sequence === this.sequence) this.hydrate(model);
    } catch (error) {
      if (sequence === this.sequence) {
        runInAction(() => {
          this.refreshFailed = true;
        });
      }
      reportApplicationError(error);
    } finally {
      if (sequence === this.sequence) {
        runInAction(() => {
          this.isRefreshing = false;
        });
      }
    }
  };
}
