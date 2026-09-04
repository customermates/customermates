import { describe, expect, it } from "vitest";

import { ViewMode } from "@/core/base/base-query-builder";

import { resolveDataViewPageState, resolveDataViewView } from "../data-view-state";

const READY = {
  explicitlyUnpaginated: false,
  hasActiveQuery: false,
  itemCount: 0,
  request: { status: "ready" } as const,
  total: 0,
};

describe("data-view page state", () => {
  it("surfaces a refresh failure when no prior rows are usable", () => {
    const failure = new Error("failed");

    expect(resolveDataViewPageState({ ...READY, request: { status: "refresh-error", error: failure } })).toBe("error");
  });

  it.each([{ status: "uninitialized" } as const, { status: "refreshing" } as const])(
    "uses a loading skeleton while $status",
    (request) => {
      expect(resolveDataViewPageState({ ...READY, request })).toBe("loading");
    },
  );

  it("keeps a failed refresh on usable prior content", () => {
    expect(
      resolveDataViewPageState({
        ...READY,
        itemCount: 2,
        request: { status: "refresh-error", error: new Error("failed") },
      }),
    ).toBe("content");
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

  it("keeps a grouped surface on its group rows when every group is collapsed", () => {
    expect(resolveDataViewPageState({ ...READY, hasActiveQuery: true, isGrouped: true, total: 3 })).toBe("content");
  });

  it("still empties a grouped surface whose query matched nothing at all", () => {
    expect(resolveDataViewPageState({ ...READY, hasActiveQuery: true, isGrouped: true, total: 0 })).toBe(
      "filtered-empty",
    );
  });

  it("maps the live table, card, and grouped card modes to matching geometry", () => {
    expect(resolveDataViewView(ViewMode.table)).toBe("table");
    expect(resolveDataViewView(ViewMode.card)).toBe("cards");
    expect(resolveDataViewView(ViewMode.card, true)).toBe("board");
    expect(resolveDataViewView(ViewMode.table, true)).toBe("table");
  });
});
