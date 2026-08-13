import type { DataViewRequestState } from "@/core/base/base-data-view.store";

import { describe, expect, it } from "vitest";

import { resolveEntityTimelineState } from "../entity-timeline-state";

const ready: DataViewRequestState = { status: "ready" };
const failed: DataViewRequestState = { status: "refresh-error", error: new Error("offline") };

describe("resolveEntityTimelineState", () => {
  it.each([
    [{ itemCount: 3, request: failed, scopeTruncated: true }, "content"],
    [{ itemCount: 0, request: failed, scopeTruncated: true }, "error"],
    [{ itemCount: 0, request: ready, scopeTruncated: true }, "scope-truncated"],
    [{ itemCount: 0, request: ready, scopeTruncated: false }, "true-empty"],
  ] as const)("resolves %j to %s", (input, expected) => {
    expect(resolveEntityTimelineState(input)).toBe(expected);
  });
});
