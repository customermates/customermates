import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { connectDataViewUrlSync } from "../data-view-url-sync";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";

const A_VIEW_ID = "7c1f2b3a-4d5e-4f60-8a71-9b2c3d4e5f60";
const A_GROUPING_COLUMN_ID = "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9";

function createStore() {
  const applyView = vi.fn((viewKey: string) => {
    runInAction(() => {
      state.activeViewKey = viewKey;
    });
  });
  const state = observable({
    activeViewKey: ALL_VIEW_KEY as string,
    applyView,
    filters: [] as { field: string; operator: FilterOperatorKey; value?: unknown }[],
    groupingColumnId: undefined as string | null | undefined,
    isRefreshing: false,
    pagination: { page: 1, pageSize: 25 },
    searchTerm: undefined as string | undefined,
    sortDescriptor: undefined as { direction: "asc" | "desc"; field: string } | undefined,
    sortableColumnIds: new Set(["name"]),
    viewMode: ViewMode.table as ViewMode,
  });
  return { applyView, state, store: state as unknown as BaseDataViewStore<HasId> };
}

describe("data-view URL synchronization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/en/contacts");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("synchronizes an initial active query and accepts an equivalent legacy URL", () => {
    const { state, store } = createStore();
    state.searchTerm = "acme";
    state.sortDescriptor = { direction: "asc", field: "name" };
    const replaceState = vi.spyOn(window.history, "replaceState");

    const cleanup = connectDataViewUrlSync(store);

    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/en/contacts?searchTerm=acme&sort=name%3Aasc");
    cleanup();

    window.history.replaceState(null, "", "/en/contacts?searchTerm=acme&sortField=name&sortDir=asc");
    replaceState.mockClear();
    const equivalentCleanup = connectDataViewUrlSync(store);
    expect(replaceState).not.toHaveBeenCalled();
    equivalentCleanup();
  });

  it("debounces settled changes and skips an equivalent URL", () => {
    const { state, store } = createStore();
    const replaceState = vi.spyOn(window.history, "replaceState");
    const cleanup = connectDataViewUrlSync(store);

    runInAction(() => {
      state.searchTerm = "first";
      state.searchTerm = "second";
    });
    vi.advanceTimersByTime(99);
    expect(replaceState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(replaceState).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("?searchTerm=second");

    runInAction(() => {
      state.searchTerm = "second";
    });
    vi.advanceTimersByTime(100);
    expect(replaceState).toHaveBeenCalledOnce();
    cleanup();
  });

  it("waits for a visible refresh to settle before updating the URL", () => {
    const { state, store } = createStore();
    const replaceState = vi.spyOn(window.history, "replaceState");
    const cleanup = connectDataViewUrlSync(store);

    runInAction(() => {
      state.isRefreshing = true;
      state.searchTerm = "pending";
    });
    vi.advanceTimersByTime(200);
    expect(replaceState).not.toHaveBeenCalled();

    runInAction(() => {
      state.isRefreshing = false;
    });
    vi.advanceTimersByTime(100);
    expect(replaceState).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("?searchTerm=pending");
    cleanup();
  });

  it("cancels pending writes on cleanup or pathname changes", () => {
    const { state, store } = createStore();
    const replaceState = vi.spyOn(window.history, "replaceState");
    const cleanup = connectDataViewUrlSync(store);

    runInAction(() => {
      state.searchTerm = "cancelled";
    });
    cleanup();
    vi.advanceTimersByTime(100);
    expect(replaceState).not.toHaveBeenCalled();

    const cleanupNext = connectDataViewUrlSync(store);
    replaceState.mockClear();
    runInAction(() => {
      state.searchTerm = "stale-route";
    });
    window.history.pushState(null, "", "/en/organizations");
    vi.advanceTimersByTime(100);
    expect(replaceState).not.toHaveBeenCalled();
    cleanupNext();
  });

  it("writes the active view id, the card mode and the grouping column, and drops them again on All", () => {
    const { state, store } = createStore();
    const replaceState = vi.spyOn(window.history, "replaceState");
    const cleanup = connectDataViewUrlSync(store);

    runInAction(() => {
      state.activeViewKey = A_VIEW_ID;
      state.viewMode = ViewMode.card;
      state.groupingColumnId = A_GROUPING_COLUMN_ID;
    });
    vi.advanceTimersByTime(100);

    expect(replaceState).toHaveBeenCalledOnce();
    expect(window.location.search).toBe(`?view=${A_VIEW_ID}&viewMode=card&groupBy=${A_GROUPING_COLUMN_ID}`);

    runInAction(() => {
      state.activeViewKey = ALL_VIEW_KEY;
      state.viewMode = ViewMode.table;
      state.groupingColumnId = null;
    });
    vi.advanceTimersByTime(100);

    expect(window.location.search).toBe("");
    cleanup();
  });

  it("keeps the grouping column out of the URL while the view mode is table", () => {
    const { state, store } = createStore();
    const cleanup = connectDataViewUrlSync(store);

    runInAction(() => {
      state.searchTerm = "acme";
      state.groupingColumnId = A_GROUPING_COLUMN_ID;
    });
    vi.advanceTimersByTime(100);

    expect(window.location.search).toBe("?searchTerm=acme");
    cleanup();
  });

  it("normalises a pasted All link out of the address bar once, leaving the applied query alone", () => {
    window.history.replaceState(null, "", `/en/contacts?view=${ALL_VIEW_KEY}&searchTerm=acme`);
    const { state, store } = createStore();
    state.searchTerm = "acme";
    const replaceState = vi.spyOn(window.history, "replaceState");

    const cleanup = connectDataViewUrlSync(store);

    expect(replaceState).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("?searchTerm=acme");
    expect(store.searchTerm).toBe("acme");
    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);

    vi.advanceTimersByTime(200);
    expect(replaceState).toHaveBeenCalledOnce();
    cleanup();
  });

  it("leaves a pasted link that already names the active view untouched", () => {
    window.history.replaceState(null, "", `/en/contacts?view=${A_VIEW_ID}`);
    const { state, store } = createStore();
    state.activeViewKey = A_VIEW_ID;
    state.searchTerm = "acme";
    const replaceState = vi.spyOn(window.history, "replaceState");

    const cleanup = connectDataViewUrlSync(store);

    expect(replaceState).toHaveBeenCalledOnce();
    expect(window.location.search).toBe(`?searchTerm=acme&view=${A_VIEW_ID}`);
    cleanup();
  });

  it("writes the active view beside the encoded filters and sort", () => {
    const { state, store } = createStore();
    const cleanup = connectDataViewUrlSync(store);

    runInAction(() => {
      state.filters = [{ field: "name", operator: FilterOperatorKey.contains, value: "acme" }];
      state.sortDescriptor = { direction: "asc", field: "name" };
      state.activeViewKey = A_VIEW_ID;
    });
    vi.advanceTimersByTime(100);

    expect(window.location.search).toBe(`?sort=name%3Aasc&view=${A_VIEW_ID}&filters=name%3Acontains%3Aacme`);
    cleanup();
  });

  it("drops the view parameter again when All becomes active", () => {
    window.history.replaceState(null, "", `/en/contacts?view=${A_VIEW_ID}`);
    const { state, store } = createStore();
    state.activeViewKey = A_VIEW_ID;
    const cleanup = connectDataViewUrlSync(store);

    runInAction(() => {
      state.activeViewKey = ALL_VIEW_KEY;
    });
    vi.advanceTimersByTime(100);

    expect(window.location.search).toBe("");
    cleanup();
  });

  it("leaves a URL that already carries the active view untouched", () => {
    window.history.replaceState(null, "", `/en/contacts?searchTerm=acme&view=${A_VIEW_ID}`);
    const { state, store } = createStore();
    state.activeViewKey = A_VIEW_ID;
    state.searchTerm = "acme";
    const replaceState = vi.spyOn(window.history, "replaceState");

    const cleanup = connectDataViewUrlSync(store);
    expect(replaceState).not.toHaveBeenCalled();

    runInAction(() => {
      state.isRefreshing = true;
      state.isRefreshing = false;
    });
    vi.advanceTimersByTime(100);

    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.search).toBe(`?searchTerm=acme&view=${A_VIEW_ID}`);
    cleanup();
  });

  it("restores the view a history entry names without pushing a new one", () => {
    window.history.replaceState(null, "", `/en/contacts?view=${A_VIEW_ID}`);
    const { applyView, state, store } = createStore();
    state.activeViewKey = A_VIEW_ID;
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const cleanup = connectDataViewUrlSync(store);

    window.history.replaceState(null, "", "/en/contacts");
    replaceState.mockClear();
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(applyView).toHaveBeenCalledExactlyOnceWith(ALL_VIEW_KEY);
    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(pushState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(replaceState).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(applyView).toHaveBeenCalledOnce();

    cleanup();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(applyView).toHaveBeenCalledOnce();
  });

  it("keeps a query parameter it does not own while it writes its own", () => {
    window.history.replaceState(null, "", "/en/contacts?threadId=abc");
    const { state, store } = createStore();
    state.activeViewKey = A_VIEW_ID;
    const replaceState = vi.spyOn(window.history, "replaceState");

    const cleanup = connectDataViewUrlSync(store);

    expect(replaceState).toHaveBeenCalledOnce();
    expect(window.location.search).toBe(`?threadId=abc&view=${A_VIEW_ID}`);

    runInAction(() => {
      state.searchTerm = "acme";
    });
    vi.advanceTimersByTime(100);

    expect(window.location.search).toBe(`?threadId=abc&searchTerm=acme&view=${A_VIEW_ID}`);
    cleanup();
  });

  it("drops only its own parameters when the query is cleared, leaving a foreign one in place", () => {
    window.history.replaceState(null, "", "/en/contacts?threadId=abc&searchTerm=stale");
    const { state, store } = createStore();
    state.searchTerm = "stale";
    const cleanup = connectDataViewUrlSync(store);

    runInAction(() => {
      state.searchTerm = undefined;
    });
    vi.advanceTimersByTime(100);

    expect(window.location.search).toBe("?threadId=abc");
    cleanup();
  });

  it("does not leak duplicate reactions across a strict remount", () => {
    const { state, store } = createStore();
    const firstCleanup = connectDataViewUrlSync(store);
    firstCleanup();
    const secondCleanup = connectDataViewUrlSync(store);
    const replaceState = vi.spyOn(window.history, "replaceState");

    runInAction(() => {
      state.searchTerm = "mounted";
    });
    vi.advanceTimersByTime(100);

    expect(replaceState).toHaveBeenCalledOnce();
    secondCleanup();
  });
});
