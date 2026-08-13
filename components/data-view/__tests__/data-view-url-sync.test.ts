import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { connectDataViewUrlSync } from "../data-view-url-sync";

function createStore() {
  const state = observable({
    filters: [],
    isRefreshing: false,
    pagination: { page: 1, pageSize: 25 },
    searchTerm: undefined as string | undefined,
    sortDescriptor: undefined as { direction: "asc" | "desc"; field: string } | undefined,
    sortableColumnIds: new Set(["name"]),
  });
  return { state, store: state as unknown as BaseDataViewStore<HasId> };
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
