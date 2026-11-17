import type { RootStore } from "@/core/stores/root.store";
import type { AgentJobDetail, AgentJobPage, AgentJobSummary } from "@/features/agent-jobs/agent-job.schema";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { BaseStore } from "@/core/base/base.store";

import { getAgentJobAction, getAgentJobsAction } from "@/components/agent-keys/agent-key-actions";

export type AgentRunSource = { sourceKind?: string; sourceId?: string };

export class AgentRunsStore extends BaseStore {
  items: AgentJobSummary[] = [];
  nextCursor: string | null = null;
  expandedId: string | null = null;
  details = new Map<string, AgentJobDetail>();
  loadingMore = false;
  loadingDetailId: string | null = null;
  private source: AgentRunSource = {};
  private pageGeneration = 0;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      items: observable.ref,
      nextCursor: observable,
      expandedId: observable,
      details: observable.shallow,
      loadingMore: observable,
      loadingDetailId: observable,
      expanded: computed,
      hasMore: computed,
      setPage: action,
    });
  }

  get expanded(): AgentJobDetail | null {
    return this.expandedId ? (this.details.get(this.expandedId) ?? null) : null;
  }

  get hasMore(): boolean {
    return this.nextCursor !== null;
  }

  setPage = (page: AgentJobPage, source: AgentRunSource = {}) => {
    this.items = page.jobs;
    this.nextCursor = page.nextCursor;
    this.source = source;
    this.expandedId = null;
    this.loadingDetailId = null;
    this.details.clear();
    this.pageGeneration += 1;
  };

  loadMore = async () => {
    if (!this.nextCursor || this.loadingMore) return;
    runInAction(() => {
      this.loadingMore = true;
    });
    try {
      const result = await getAgentJobsAction({ ...this.source, cursor: this.nextCursor });
      if (!result.ok) {
        this.toastError("AgentJobs.loadFailed");
        return;
      }
      runInAction(() => {
        this.items = [...this.items, ...result.data.jobs];
        this.nextCursor = result.data.nextCursor;
      });
    } finally {
      runInAction(() => {
        this.loadingMore = false;
      });
    }
  };

  toggle = async (id: string) => {
    if (this.expandedId === id) {
      runInAction(() => {
        this.expandedId = null;
      });
      return;
    }
    runInAction(() => {
      this.expandedId = id;
    });
    if (this.details.has(id)) return;
    const generation = this.pageGeneration;
    runInAction(() => {
      this.loadingDetailId = id;
    });
    try {
      const result = await getAgentJobAction({ id });
      if (generation !== this.pageGeneration) return;
      if (!result.ok) {
        runInAction(() => {
          if (this.expandedId === id) this.expandedId = null;
        });
        this.toastError("AgentJobs.loadFailed");
        return;
      }
      runInAction(() => this.details.set(id, result.data));
    } finally {
      runInAction(() => {
        if (generation === this.pageGeneration && this.loadingDetailId === id) this.loadingDetailId = null;
      });
    }
  };
}
