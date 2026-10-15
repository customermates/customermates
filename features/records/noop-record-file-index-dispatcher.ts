import type { RecordFileIndexDispatcher } from "./record-file-index-dispatcher";

export class NoopRecordFileIndexDispatcher implements RecordFileIndexDispatcher {
  dispatch(): Promise<void> {
    return Promise.resolve();
  }
}
