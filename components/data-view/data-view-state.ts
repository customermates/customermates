import { ViewMode } from "@/core/base/base-query-builder";

export type DataViewPageState = "error" | "loading" | "filtered-empty" | "true-empty" | "content";

export type DataViewSkeletonView = "table" | "cards" | "board";

type ResolveDataViewPageStateInput = {
  failure: boolean;
  hasUsableContent: boolean;
  isReady: boolean;
  isRefreshing: boolean;
  itemCount: number;
  hasActiveQuery: boolean;
  total?: number;
  explicitlyUnpaginated: boolean;
};

export function resolveDataViewPageState({
  failure,
  hasUsableContent,
  isReady,
  isRefreshing,
  itemCount,
  hasActiveQuery,
  total,
  explicitlyUnpaginated,
}: ResolveDataViewPageStateInput): DataViewPageState {
  if (failure && !hasUsableContent) return "error";
  if (!isReady || isRefreshing) return "loading";
  if (itemCount > 0) return "content";
  if (hasActiveQuery) return "filtered-empty";
  if (total === 0 || explicitlyUnpaginated) return "true-empty";
  return "content";
}

export function resolveDataViewSkeletonView(
  viewMode: ViewMode,
  groupingColumnId?: string | null,
): DataViewSkeletonView {
  if (viewMode === ViewMode.table) return "table";
  return groupingColumnId ? "board" : "cards";
}
