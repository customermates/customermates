import type { WikiPageListResult, WikiPageSearchResult } from "@/features/wiki/wiki.schema";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { Debouncer } from "@/core/utils/debounce";
import { reportApplicationError } from "@/core/errors/report-application-error";

import { getWikiPagesAction, moveWikiPageAction, searchWikiPagesAction } from "../actions";

export class WikiPagesStore {
  result: WikiPageListResult | WikiPageSearchResult;
  query = "";
  page: number;
  requestState: "idle" | "loading" | "failed" = "idle";
  reordering = false;

  private initial: WikiPageListResult;
  private loadInitial = false;
  private forceRefresh = false;
  private active = false;
  private generation = 0;
  private debouncer = new Debouncer();

  constructor(initial: WikiPageListResult) {
    this.initial = initial;
    this.result = initial;
    this.page = initial.page;
    makeObservable(this, {
      result: observable.ref,
      query: observable,
      page: observable,
      requestState: observable,
      reordering: observable,
      loading: computed,
      failed: computed,
      hasMore: computed,
      totalIsExact: computed,
      bind: action,
      search: action,
      setPage: action,
      retry: action,
      move: action,
      dispose: action,
    });
  }

  get loading() {
    return this.requestState === "loading";
  }

  get failed() {
    return this.requestState === "failed";
  }

  get hasMore() {
    return "hasMore" in this.result && this.result.hasMore !== undefined
      ? this.result.hasMore
      : this.page * this.result.pageSize < this.result.total;
  }

  get totalIsExact() {
    return !("totalIsExact" in this.result) || this.result.totalIsExact !== false;
  }

  bind = (initial: WikiPageListResult, loadInitial: boolean) => {
    this.active = true;
    this.initial = initial;
    this.loadInitial = loadInitial;
    this.invalidate();
    void this.refresh();
  };

  search = (value: string) => {
    this.query = value;
    this.page = 1;
    this.invalidate();
    this.requestState = "loading";
    this.debouncer.run(() => void this.refresh());
  };

  setPage = (page: number) => {
    this.page = page;
    this.invalidate();
    void this.refresh();
  };

  retry = () => {
    this.forceRefresh = true;
    this.invalidate();
    void this.refresh();
  };

  move = async (id: string, targetId: string, placement: "before" | "after") => {
    if (!this.active || this.reordering || this.loading || this.query.trim() || this.failed) return null;
    this.reordering = true;
    try {
      const response = await moveWikiPageAction({ id, targetId, placement });
      if (response.ok && this.active) this.retry();
      return response;
    } catch (error: unknown) {
      if (this.active) reportApplicationError(error);
      return null;
    } finally {
      runInAction(() => {
        this.reordering = false;
      });
    }
  };

  dispose = () => {
    this.active = false;
    this.invalidate();
  };

  private invalidate() {
    this.generation += 1;
    this.debouncer.cancel();
  }

  private refresh = async () => {
    if (!this.active) return;
    const generation = ++this.generation;
    const query = this.query.trim();
    const page = this.page;
    const isCurrent = () => this.active && generation === this.generation;
    if (!this.loadInitial && !this.forceRefresh && !query && page === this.initial.page) {
      runInAction(() => {
        this.result = this.initial;
        this.requestState = "idle";
      });
      return;
    }
    runInAction(() => {
      this.requestState = "loading";
    });
    try {
      const response = await (query
        ? searchWikiPagesAction({ query, page, pageSize: 25 })
        : getWikiPagesAction({ page, pageSize: 25 }));
      runInAction(() => {
        if (!isCurrent()) return;
        if (response.ok) {
          this.result = response.data;
          this.requestState = "idle";
        } else this.requestState = "failed";
      });
    } catch (error: unknown) {
      if (!isCurrent()) return;
      reportApplicationError(error);
      runInAction(() => {
        this.requestState = "failed";
      });
    }
  };
}
