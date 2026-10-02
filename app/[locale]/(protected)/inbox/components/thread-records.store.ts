import { action, makeObservable, observable, runInAction, toJS } from "mobx";
import { BaseStore } from "@/core/base/base.store";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordSearchHit } from "@/features/records/record-search.schema";
import type {
  ThreadRecordsResult,
  MutateThreadRecordsInput,
} from "@/ee/messaging/thread-records/thread-records.schema";
import { readThreadRecordsAction, mutateThreadRecordsAction } from "../actions";
import { globalSearchAction } from "../../search/actions";
import { Debouncer } from "@/core/utils/debounce";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class ThreadRecordsStore extends BaseStore {
  detail: ThreadRecordsResult | null = null;
  query = "";
  results: RecordSearchHit[] = [];
  searching = false;
  loading = false;
  error = false;
  pending = false;
  private threadId = "";
  private generation = 0;
  private searchGeneration = 0;
  private debouncer = new Debouncer();
  private retry: { key: string; input: MutateThreadRecordsInput } | null = null;

  constructor(root: RootStore) {
    super(root);
    makeObservable(this, {
      detail: observable,
      query: observable,
      results: observable,
      searching: observable,
      loading: observable,
      error: observable,
      pending: observable,
      bind: action,
      reload: action,
      setSearching: action,
      retryCurrent: action,
      setQuery: action,
      mutate: action,
      dispose: action,
    });
  }

  bind = (threadId: string) => {
    this.dispose();
    this.threadId = threadId;
    this.detail = null;
    void this.reload();
  };

  dispose = () => {
    this.threadId = "";
    this.generation += 1;
    this.searchGeneration += 1;
    this.debouncer.cancel();
    this.searching = false;
    this.query = "";
    this.results = [];
    this.retry = null;
    this.pending = false;
    this.loading = false;
  };

  reload = async () => {
    const threadId = this.threadId;
    if (!threadId) return;
    const generation = ++this.generation;
    this.loading = true;
    this.error = false;
    try {
      const result = await readThreadRecordsAction(threadId);
      runInAction(() => {
        if (threadId !== this.threadId || generation !== this.generation) return;
        if (result.ok) this.detail = result.data;
        else {
          this.detail = null;
          this.error = true;
        }
      });
    } catch {
      runInAction(() => {
        if (generation === this.generation) {
          this.detail = null;
          this.error = true;
        }
      });
    } finally {
      runInAction(() => {
        if (generation === this.generation) this.loading = false;
      });
    }
  };

  setSearching = (next: boolean) => {
    this.searchGeneration += 1;
    this.debouncer.cancel();
    this.searching = next;
    this.loading = false;
    this.query = "";
    this.results = [];
    this.error = false;
  };

  setQuery = (query: string) => {
    this.query = query;
    const generation = ++this.searchGeneration;
    this.results = [];
    this.error = false;
    this.loading = query.trim().length > 0;
    this.debouncer.run(() => void this.search(generation, query.trim()));
  };

  retryCurrent = async () => {
    if (!this.searching) {
      await this.reload();
      return;
    }
    this.debouncer.cancel();
    const generation = ++this.searchGeneration;
    const query = this.query.trim();
    this.error = false;
    this.loading = query.length > 0;
    if (query) await this.search(generation, query);
  };

  private async search(generation: number, query: string) {
    if (!query) return;
    try {
      const result = await globalSearchAction({
        searchTerm: query,
        includeEmbedded: true,
        limit: 25,
        cursor: null,
      });
      runInAction(() => {
        if (generation !== this.searchGeneration) return;
        if (result.ok) {
          this.results = result.data.results.filter(
            (record) =>
              record.canEdit === true &&
              !this.detail?.records.some(
                (existing) =>
                  existing.ref.typeId === record.ref.typeId && existing.ref.recordId === record.ref.recordId,
              ),
          );
        } else this.error = true;
      });
    } catch {
      runInAction(() => {
        if (generation === this.searchGeneration) this.error = true;
      });
    } finally {
      runInAction(() => {
        if (generation === this.searchGeneration) this.loading = false;
      });
    }
  }

  mutate = async (action: "link" | "unlink", reference: RecordRef) => {
    const threadId = this.threadId;
    if (!this.detail || !threadId || this.pending) return;
    const ref = { typeId: reference.typeId, recordId: reference.recordId };
    const key = JSON.stringify([this.rootStore.userStore.user?.id, threadId, action, ref]);
    if (this.retry?.key !== key) {
      this.retry = {
        key,
        input: {
          action,
          threadId,
          ref,
          expectedRevision: this.detail.schemaRevision,
          idempotencyKey: crypto.randomUUID(),
        },
      };
    }
    this.pending = true;
    this.error = false;
    try {
      const result = await mutateThreadRecordsAction(toJS(this.retry.input));
      if (this.threadId !== threadId) return;
      runInAction(() => {
        this.retry = null;
      });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        runInAction(() => {
          this.error = true;
        });
        await this.reload();
        return;
      }
      runInAction(() => {
        this.setSearching(false);
      });
      await this.reload();
      await this.rootStore.recordWorkspaceStore.invalidate();
    } catch {
      runInAction(() => {
        if (this.threadId === threadId) this.error = true;
      });
    } finally {
      runInAction(() => {
        if (this.threadId === threadId) this.pending = false;
      });
    }
  };
}
