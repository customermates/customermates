import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { reaction, toJS } from "mobx";

import { decodeGetParams, encodeGetParams } from "@/core/utils/get-params";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

type DataViewUrlSyncWindow = Pick<Window, "clearTimeout" | "history" | "location" | "setTimeout">;

function getQueryString<E extends HasId>(store: BaseDataViewStore<E>): string {
  return encodeGetParams({
    filters: store.filters,
    searchTerm: store.searchTerm,
    sortDescriptor: store.sortableColumnIds.size > 0 ? store.sortDescriptor : undefined,
    page: store.pagination?.page,
    pageSize: store.pagination?.pageSize,
    viewId: store.activeViewKey === ALL_VIEW_KEY ? undefined : store.activeViewKey,
    viewMode: store.viewMode,
    groupingColumnId: store.groupingColumnId ?? undefined,
  }).toString();
}

function needsUrlUpdate<E extends HasId>(store: BaseDataViewStore<E>, currentSearch: string): boolean {
  const raw = currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch;
  let normalizedSearch = raw;
  try {
    normalizedSearch = encodeGetParams(decodeGetParams(new URLSearchParams(raw))).toString();
  } catch {
    normalizedSearch = raw;
  }
  return normalizedSearch !== getQueryString(store);
}

export function connectDataViewUrlSync<E extends HasId>(
  store: BaseDataViewStore<E>,
  browser: DataViewUrlSyncWindow = window,
): () => void {
  const boundPathname = browser.location.pathname;
  let updateTimer: number | undefined;

  const clearPendingUpdate = () => {
    if (updateTimer === undefined) return;
    browser.clearTimeout(updateTimer);
    updateTimer = undefined;
  };

  const syncUrlToState = () => {
    updateTimer = undefined;
    if (browser.location.pathname !== boundPathname) return;

    const currentSearch = browser.location.search.slice(1);
    if (!needsUrlUpdate(store, currentSearch)) return;

    const queryString = getQueryString(store);
    browser.history.replaceState(null, "", queryString ? `${boundPathname}?${queryString}` : boundPathname);
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

  if ((store.filters?.length ?? 0) > 0 || Boolean(store.searchTerm)) syncUrlToState();

  return () => {
    disposeReaction();
    clearPendingUpdate();
  };
}
