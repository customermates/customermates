import type { DataViewRequestState } from "@/core/base/base-data-view.store";

import { ViewMode } from "@/core/base/base-query-builder";

export type DataViewPageState = "error" | "loading" | "filtered-empty" | "true-empty" | "content";

export type DataViewView = "table" | "board" | "calendar";

type ResolveDataViewPageStateInput = {
  request: DataViewRequestState;
  itemCount: number;
  hasActiveQuery: boolean;
  total?: number;
  explicitlyUnpaginated: boolean;
  isGrouped?: boolean;
  hasRequiredData?: boolean;
};

export function resolveDataViewPageState({
  request,
  itemCount,
  hasActiveQuery,
  total,
  explicitlyUnpaginated,
  isGrouped,
  hasRequiredData = true,
}: ResolveDataViewPageStateInput): DataViewPageState {
  if (request.status === "refresh-error" && (itemCount === 0 || !hasRequiredData)) return "error";
  if (request.status === "uninitialized" || request.status === "refreshing" || !hasRequiredData) return "loading";
  if (itemCount > 0) return "content";
  if (isGrouped && (total ?? 0) > 0) return "content";
  if (hasActiveQuery) return "filtered-empty";
  if (total === 0 || explicitlyUnpaginated) return "true-empty";
  return "content";
}

export function resolveDataViewView(viewMode: ViewMode, canBoard: boolean, canCalendar = false): DataViewView {
  if (viewMode === ViewMode.calendar && canCalendar) return "calendar";
  return viewMode === ViewMode.card && canBoard ? "board" : "table";
}
