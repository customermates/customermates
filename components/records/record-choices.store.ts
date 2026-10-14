import { action, makeObservable, observable, runInAction } from "mobx";

import type { RecordChoicesInput, RecordChoicesResult } from "@/features/records/get-record-choices.interactor";

import { getRecordChoicesAction } from "@/app/[locale]/(protected)/records/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";

type RecordChoicesResponse = { key: string; data: RecordChoicesResult | null; failed: boolean };

export function recordChoicesKey(input: RecordChoicesInput, attempt: number) {
  return JSON.stringify([input, attempt]);
}

export class RecordChoicesStore {
  response: RecordChoicesResponse | null = null;
  private requestKey: string | null = null;

  constructor() {
    makeObservable(this, { response: observable.ref, load: action, cancel: action });
  }

  read(key: string | null) {
    const current = key !== null && this.response?.key === key ? this.response : null;
    return { data: current?.data, failed: current?.failed ?? false, loading: key !== null && current === null };
  }

  load = async (key: string, input: RecordChoicesInput) => {
    this.requestKey = key;
    try {
      const result = await getRecordChoicesAction(JSON.parse(JSON.stringify(input)) as RecordChoicesInput);
      runInAction(() => {
        if (this.requestKey === key) this.response = { key, data: result.ok ? result.data : null, failed: !result.ok };
      });
    } catch (error) {
      if (this.requestKey !== key) return;
      reportApplicationError(error);
      runInAction(() => {
        this.response = { key, data: null, failed: true };
      });
    }
  };

  cancel = () => {
    this.requestKey = null;
  };
}
