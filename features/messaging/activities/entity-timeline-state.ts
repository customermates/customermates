import type { DataViewRequestState } from "@/core/base/base-data-view.store";

export type EntityTimelineState = "error" | "scope-truncated" | "true-empty" | "content";

export function resolveEntityTimelineState(input: {
  itemCount: number;
  request: DataViewRequestState;
  scopeTruncated: boolean;
}): EntityTimelineState {
  if (input.itemCount > 0) return "content";
  if (input.request.status === "refresh-error") return "error";
  if (input.scopeTruncated) return "scope-truncated";

  return "true-empty";
}
