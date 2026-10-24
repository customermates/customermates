import type { RecordFileRequest, RecordFileTransfer, RecordFileUploadStart } from "./record-file-upload";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { sendRecordFileBytes } from "./record-file-upload";

export type RecordFileUpload = {
  key: string;
  name: string;
  size: number;
  mimeType: string;
  progress: number;
  phase: "uploading" | "reading" | "failed";
  failure: string | null;
};

type RecordFileUploadRequest<Result> = {
  room: number;
  refusal: string;
  failure: string;
  start: (file: File) => Promise<RecordFileUploadStart>;
  complete: (fileId: string, file: File) => Promise<RecordFileRequest<Result>>;
  completed: (result: Result) => void;
};

export class RecordFileUploadQueue {
  uploads: RecordFileUpload[] = [];
  private readonly transfers = new Map<string, RecordFileTransfer>();
  private generation = 0;

  constructor() {
    makeObservable(this, {
      uploads: observable.ref,
      pending: computed,
      add: action,
      remove: action,
      clear: action,
    });
  }

  get pending() {
    return this.uploads.filter((upload) => upload.phase !== "failed").length;
  }

  add<Result>(files: readonly File[], request: RecordFileUploadRequest<Result>) {
    const generation = this.generation;
    const added = files.map((file, index) => {
      const accepted = index < request.room;
      const upload: RecordFileUpload = {
        key: globalThis.crypto.randomUUID(),
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        progress: 0,
        phase: accepted ? "uploading" : "failed",
        failure: accepted ? null : request.refusal,
      };
      return { file, upload, accepted };
    });
    this.uploads = [...this.uploads, ...added.map(({ upload }) => upload)];
    for (const { file, upload, accepted } of added) if (accepted) void this.run(upload.key, file, generation, request);
  }

  remove(key: string) {
    const transfer = this.transfers.get(key);
    this.transfers.delete(key);
    this.uploads = this.uploads.filter((upload) => upload.key !== key);
    transfer?.abort();
  }

  clear() {
    this.generation += 1;
    for (const transfer of this.transfers.values()) transfer.abort();
    this.transfers.clear();
    this.uploads = [];
  }

  private change(key: string, change: Partial<RecordFileUpload>) {
    runInAction(() => {
      if (!this.uploads.some((upload) => upload.key === key)) return;
      this.uploads = this.uploads.map((upload) => (upload.key === key ? { ...upload, ...change } : upload));
    });
  }

  private async run<Result>(key: string, file: File, generation: number, request: RecordFileUploadRequest<Result>) {
    const current = () => generation === this.generation && this.uploads.some((upload) => upload.key === key);
    const fail = (message: string | null) => this.change(key, { phase: "failed", failure: message || request.failure });
    try {
      const started = await request.start(file);
      if (!current()) return;
      if (!started.ok) return fail(started.message);
      const transfer = sendRecordFileBytes(started.data.upload, file, (loaded, total) =>
        this.change(key, { progress: total ? loaded / total : 0 }),
      );
      this.transfers.set(key, transfer);
      const sent = await transfer.done;
      this.transfers.delete(key);
      if (!current()) return;
      if (!sent.ok) return sent.aborted ? this.remove(key) : fail(sent.message);
      this.change(key, { phase: "reading", progress: 1 });
      const completed = await request.complete(started.data.fileId, file);
      if (!current()) return;
      if (!completed.ok) return fail(completed.message);
      runInAction(() => {
        this.uploads = this.uploads.filter((upload) => upload.key !== key);
        request.completed(completed.data);
      });
    } catch {
      if (current()) fail(null);
    }
  }
}
