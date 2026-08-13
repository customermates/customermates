import type { DataViewRequestState } from "@/core/base/base-data-view.store";

export type ResourcePageState = "loading" | "error" | "true-empty" | "content";

export function resolveResourcePageState(request: DataViewRequestState, itemCount: number): ResourcePageState {
  if (request.status === "refresh-error" && itemCount === 0) return "error";
  if (request.status === "uninitialized" || request.status === "refreshing") return "loading";
  return itemCount === 0 ? "true-empty" : "content";
}
