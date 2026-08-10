import { describe, expect, it } from "vitest";

import { ViewMode } from "@/core/base/base-query-builder";

import { resolveDataViewPageState, resolveDataViewSkeletonView } from "../data-view-state";

const READY = {
  explicitlyUnpaginated: false,
  failure: false,
  hasActiveQuery: false,
  hasUsableContent: true,
  isReady: true,
  isRefreshing: false,
  itemCount: 0,
  total: 0,
};

describe("data-view page state", () => {
  it("gives an unusable failure precedence over loading", () => {
    expect(
      resolveDataViewPageState({
        ...READY,
        failure: true,
        hasUsableContent: false,
        isReady: false,
      }),
    ).toBe("error");
  });

  it.each([
    { isReady: false, isRefreshing: false },
    { isReady: true, isRefreshing: true },
  ])("uses a loading skeleton while readiness is pending", (pending) => {
    expect(resolveDataViewPageState({ ...READY, ...pending })).toBe("loading");
  });

  it("keeps a failed refresh on usable prior content", () => {
    expect(resolveDataViewPageState({ ...READY, failure: true, itemCount: 2 })).toBe("content");
  });

  it("gives active search and filters precedence over a zero total", () => {
    expect(resolveDataViewPageState({ ...READY, hasActiveQuery: true })).toBe("filtered-empty");
  });

  it("requires a proven workspace-wide zero for paginated true-empty", () => {
    expect(resolveDataViewPageState(READY)).toBe("true-empty");
    expect(resolveDataViewPageState({ ...READY, total: 7 })).toBe("content");
    expect(resolveDataViewPageState({ ...READY, total: undefined })).toBe("content");
  });

  it("allows item count only for an explicitly unpaginated store", () => {
    expect(resolveDataViewPageState({ ...READY, explicitlyUnpaginated: true, total: undefined })).toBe("true-empty");
  });

  it("never hides loaded rows behind an empty state", () => {
    expect(resolveDataViewPageState({ ...READY, hasActiveQuery: true, itemCount: 1 })).toBe("content");
  });

  it("maps the live table, card, and grouped card modes to matching geometry", () => {
    expect(resolveDataViewSkeletonView(ViewMode.table)).toBe("table");
    expect(resolveDataViewSkeletonView(ViewMode.card)).toBe("cards");
    expect(resolveDataViewSkeletonView(ViewMode.card, "pipeline-stage")).toBe("board");
  });
});
