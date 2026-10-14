import { action, computed, makeObservable, observable, runInAction } from "mobx";
import type {
  RecordDetailLayout,
  RecordDetailLayoutResult,
  SaveRecordDetailLayoutInput,
} from "@/features/records/record-detail-layout.schema";
import { readRecordDetailLayoutAction, saveRecordDetailLayoutAction } from "@/app/[locale]/(protected)/records/actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { reportApplicationError } from "@/core/errors/report-application-error";

export type RecordDetailLayoutNotifications = {
  saveFailed: (store: RecordDetailLayoutStore) => void;
  saveRecovered: (store: RecordDetailLayoutStore) => void;
};

export class RecordDetailLayoutStore {
  readonly withUnsavedChangesGuard = false;
  readonly hasUnsavedChanges = false;
  state: RecordDetailLayoutResult;
  layout: RecordDetailLayout;
  dirty = false;
  isSaving = false;
  saveFailed = false;
  readFailed = false;
  get failed() {
    return this.saveFailed || this.readFailed;
  }
  get isLoading() {
    return this.dirty || this.isSaving;
  }
  private disposed = false;
  private generation = 0;
  private readRequest = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private desired: { layout: RecordDetailLayout | null; generation: number } | null = null;
  private unconfirmed: { request: SaveRecordDetailLayoutInput; generation: number } | null = null;
  private running: Promise<void> | null = null;

  constructor(
    initial: RecordDetailLayoutResult,
    private readonly notifications?: RecordDetailLayoutNotifications,
  ) {
    this.state = initial;
    this.layout = initial.layout;
    makeObservable(this, {
      state: observable.ref,
      layout: observable.ref,
      dirty: observable,
      isSaving: observable,
      saveFailed: observable,
      readFailed: observable,
      failed: computed,
      hydrate: action,
      change: action,
      discard: action,
    });
  }

  hydrate = (value: RecordDetailLayoutResult) => {
    if (this.disposed || value.typeId !== this.state.typeId || value.schemaRevision < this.state.schemaRevision) return;
    if (this.dirty || this.isSaving) return;
    this.generation += 1;
    this.state = value;
    this.layout = value.layout;
    this.saveFailed = false;
    this.readFailed = false;
  };

  change = (layout: RecordDetailLayout | null) => {
    if (this.disposed) return;
    this.desired = { layout, generation: ++this.generation };
    if (layout) this.layout = layout;
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 700);
  };

  togglePinned = (id: string) =>
    this.change({
      ...this.layout,
      pinnedFields: this.layout.pinnedFields.includes(id)
        ? this.layout.pinnedFields.filter((field) => field !== id)
        : [...this.layout.pinnedFields, id],
    });

  toggleHidden = (id: string) =>
    this.change({
      ...this.layout,
      hiddenFields: this.layout.hiddenFields.includes(id)
        ? this.layout.hiddenFields.filter((field) => field !== id)
        : [...this.layout.hiddenFields, id],
    });

  reorder = (fieldOrder: string[]) => this.change({ ...this.layout, fieldOrder });

  reset = () => {
    this.change(null);
    return this.flush();
  };

  refresh = async () => {
    if (this.disposed || this.isSaving) return;
    const generation = this.generation;
    const request = ++this.readRequest;
    try {
      const result = await readRecordDetailLayoutAction(this.state.typeId);
      if (this.disposed || generation !== this.generation || request !== this.readRequest) return;
      if (!result.ok) {
        runInAction(() => {
          this.readFailed = true;
        });
        return;
      }
      runInAction(() => {
        if (result.data.schemaRevision < this.state.schemaRevision) return;
        this.state = result.data;
        this.readFailed = false;
        if (!this.dirty) {
          this.layout = result.data.layout;
          this.saveFailed = false;
        }
      });
    } catch (error) {
      if (this.disposed || generation !== this.generation || request !== this.readRequest) return;
      runInAction(() => {
        this.readFailed = true;
      });
      reportApplicationError(error);
    }
  };

  discard = () => {
    if (this.disposed || this.isSaving) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.generation += 1;
    this.desired = null;
    this.unconfirmed = null;
    this.dirty = false;
    this.saveFailed = false;
    this.layout = this.state.layout;
    this.notifications?.saveRecovered(this);
    void this.refresh();
  };

  retry = async () => {
    if (!this.unconfirmed) await this.refresh();
    await this.flush();
  };

  flush = (): Promise<void> => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.running) return this.running;
    if (this.disposed || (!this.desired && !this.unconfirmed)) return Promise.resolve();
    this.running = this.save().finally(() => {
      this.running = null;
    });
    return this.running;
  };

  private async save() {
    this.generation += 1;
    runInAction(() => {
      this.isSaving = true;
      this.saveFailed = false;
    });
    try {
      while (!this.disposed && (this.desired || this.unconfirmed)) {
        const pending =
          this.unconfirmed ??
          (this.desired && {
            generation: this.desired.generation,
            request: {
              typeId: this.state.typeId,
              expectedRevision: this.state.schemaRevision,
              idempotencyKey: crypto.randomUUID(),
              layout: this.desired.layout,
            },
          });
        if (!pending) return;
        this.unconfirmed = pending;
        const result = await saveRecordDetailLayoutAction(pending.request);
        if (this.disposed) return;
        this.unconfirmed = null;
        if (!result.ok) {
          runInAction(() => {
            this.saveFailed = true;
          });
          toastZodErrorTree(result.error);
          this.notifications?.saveFailed(this);
          return;
        }
        runInAction(() => {
          this.state = result.data;
          this.readFailed = false;
          if (this.desired?.generation === pending.generation) {
            this.desired = null;
            this.dirty = false;
            this.layout = result.data.layout;
          }
        });
      }
      if (!this.disposed) this.notifications?.saveRecovered(this);
    } catch (error) {
      if (!this.disposed) {
        runInAction(() => {
          this.saveFailed = true;
        });
        this.notifications?.saveFailed(this);
      }
      reportApplicationError(error);
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  dispose = () => {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.desired = null;
    this.unconfirmed = null;
  };
}
