import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { reaction, toJS } from "mobx";

import { GET_PARAM_KEYS, decodeGetParams, encodeGetParams } from "@/core/utils/get-params";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

const OWNED_KEYS = new Set<string>(GET_PARAM_KEYS);

type DataViewUrlSyncWindow = Pick<
  Window,
  "addEventListener" | "clearTimeout" | "history" | "location" | "removeEventListener" | "setTimeout"
>;

function withForeignParams(currentSearch: string, owned: URLSearchParams): string {
  const merged = new URLSearchParams();

  for (const [key, value] of new URLSearchParams(currentSearch)) if (!OWNED_KEYS.has(key)) merged.append(key, value);
  for (const [key, value] of owned) merged.append(key, value);

  return merged.toString();
}

function getQueryString<E extends HasId>(store: BaseDataViewStore<E>, currentSearch: string): string {
  return withForeignParams(
    currentSearch,
    encodeGetParams({
      filters: store.filters,
      searchTerm: store.searchTerm,
      sortDescriptor: store.sortableColumnIds.size > 0 ? store.sortDescriptor : undefined,
      page: store.pagination?.page,
      pageSize: store.pagination?.pageSize,
      viewId: store.activeViewKey === ALL_VIEW_KEY ? undefined : store.activeViewKey,
      viewMode: store.viewMode,
      groupingColumnId: store.groupingColumnId ?? undefined,
    }),
  );
}

function needsUrlUpdate<E extends HasId>(store: BaseDataViewStore<E>, currentSearch: string): boolean {
  const raw = currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch;
  let normalizedSearch = raw;
  try {
    normalizedSearch = withForeignParams(raw, encodeGetParams(decodeGetParams(new URLSearchParams(raw))));
  } catch {
    normalizedSearch = raw;
  }
  return normalizedSearch !== getQueryString(store, raw);
}

export function connectDataViewUrlSync<E extends HasId>(
  store: BaseDataViewStore<E>,
  browser: DataViewUrlSyncWindow = window,
): () => void {
  const boundPathname = browser.location.pathname;
  let updateTimer: number | undefined;
  let isRestoringFromHistory = false;

  const clearPendingUpdate = () => {
    if (updateTimer === undefined) return;
    browser.clearTimeout(updateTimer);
    updateTimer = undefined;
  };

  const syncUrlToState = () => {
    updateTimer = undefined;
    if (isRestoringFromHistory) {
      isRestoringFromHistory = false;
      return;
    }
    if (browser.location.pathname !== boundPathname) return;

    const currentSearch = browser.location.search.slice(1);
    if (!needsUrlUpdate(store, currentSearch)) return;

    const queryString = getQueryString(store, currentSearch);
    browser.history.replaceState(null, "", queryString ? `${boundPathname}?${queryString}` : boundPathname);
  };

  const restoreFromHistory = () => {
    if (browser.location.pathname !== boundPathname) return;

    const restored = new URLSearchParams(browser.location.search).get("view") ?? ALL_VIEW_KEY;
    if (restored === store.activeViewKey) return;

    isRestoringFromHistory = true;
    try {
      store.applyView(restored);
    } finally {
      if (updateTimer === undefined) isRestoringFromHistory = false;
    }
  };

  const disposeReaction = reaction(
    () => ({
      activeViewKey: store.activeViewKey,
      filters: toJS(store.filters),
      groupingColumnId: store.groupingColumnId,
      isRefreshing: store.isRefreshing,
      page: store.pagination?.page ?? 1,
      pageSize: store.pagination?.pageSize ?? 25,
      searchTerm: store.searchTerm,
      sortDescriptor: toJS(store.sortDescriptor),
      viewMode: store.viewMode,
    }),
    () => {
      if (store.isRefreshing) return;
      clearPendingUpdate();
      updateTimer = browser.setTimeout(syncUrlToState, 100);
    },
  );

  browser.addEventListener("popstate", restoreFromHistory);

  if ((store.filters?.length ?? 0) > 0 || Boolean(store.searchTerm) || store.activeViewKey !== ALL_VIEW_KEY)
    syncUrlToState();

  return () => {
    browser.removeEventListener("popstate", restoreFromHistory);
    disposeReaction();
    clearPendingUpdate();
  };
}
