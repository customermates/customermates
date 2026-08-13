import type { DataViewRequestState } from "@/core/base/base-data-view.store";

import { ViewMode } from "@/core/base/base-query-builder";

export type DataViewPageState = "error" | "loading" | "filtered-empty" | "true-empty" | "content";

export type DataViewView = "table" | "cards" | "board";

type ResolveDataViewPageStateInput = {
  request: DataViewRequestState;
  itemCount: number;
  hasActiveQuery: boolean;
  total?: number;
  explicitlyUnpaginated: boolean;
};

export function resolveDataViewPageState({
  request,
  itemCount,
  hasActiveQuery,
  total,
  explicitlyUnpaginated,
}: ResolveDataViewPageStateInput): DataViewPageState {
  if (request.status === "refresh-error" && itemCount === 0) return "error";
  if (request.status === "uninitialized" || request.status === "refreshing") return "loading";
  if (itemCount > 0) return "content";
  if (hasActiveQuery) return "filtered-empty";
  if (total === 0 || explicitlyUnpaginated) return "true-empty";
  return "content";
}

export function resolveDataViewView(viewMode: ViewMode, groupingColumnId?: string | null): DataViewView {
  if (viewMode === ViewMode.table) return "table";
  return groupingColumnId ? "board" : "cards";
}
