import { describe, expect, it } from "vitest";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";

import { type SharedView, decodeSharedView, encodeSharedView, scopeSharedViewState } from "../shared-view-link";

const SURFACE_KEY = "records:82034465-6534-478c-8de8-775b9fdb0d3e";

describe("shared view links", () => {
  it("round-trips a view's presentation state through a URL-safe token", () => {
    const shared: SharedView = {
      name: "Größte Deals ✓",
      surfaceKey: SURFACE_KEY,
      state: {
        filters: [{ field: "stage", operator: FilterOperatorKey.in, value: ["won", "a,b"] }],
        searchTerm: "R2 spreadsheet",
        sortDescriptor: { field: "value", direction: "desc" as const },
        pageSize: 10 as const,
        viewMode: ViewMode.card,
        grouping: { field: "stage" },
        columnOrder: ["value", "stage"],
        columnWidths: { value: 180 },
        hiddenColumns: ["notes"],
      },
    };

    const token = encodeSharedView(shared);

    expect(token).toMatch(/^[\w-]+$/u);
    expect(decodeSharedView(token)).toEqual(shared);
  });

  it("rejects malformed, foreign and oversized tokens", () => {
    const encode = (value: unknown) =>
      btoa(JSON.stringify(value)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");

    expect(decodeSharedView(null)).toBeUndefined();
    expect(decodeSharedView("not base64!")).toBeUndefined();
    expect(decodeSharedView(encode({ name: "x", surfaceKey: "nope", state: {} }))).toBeUndefined();
    expect(decodeSharedView(encode({ name: "x", surfaceKey: SURFACE_KEY, state: { owner: "a" } }))).toBeUndefined();
    expect(decodeSharedView(encode({ name: "x", surfaceKey: SURFACE_KEY, state: {}, id: "a" }))).toBeUndefined();
    expect(decodeSharedView("a".repeat(16001))).toBeUndefined();
  });

  it("keeps only what the recipient can read and fills the remaining settings", () => {
    const scoped = scopeSharedViewState(
      {
        filters: [
          { field: "stage", operator: FilterOperatorKey.isNotNull },
          { field: "secret", operator: FilterOperatorKey.isNotNull },
        ],
        sortDescriptor: { field: "secret", direction: "asc" },
        viewMode: ViewMode.card,
        grouping: { field: "secret" },
        columnOrder: ["secret", "value"],
        columnWidths: { secret: 120, value: 90 },
        hiddenColumns: ["secret", "value"],
      },
      {
        columnIds: new Set(["value", "stage"]),
        filterFields: new Set(["stage"]),
        groupings: [{ field: "stage" }],
        sortableColumnIds: new Set(["value"]),
        supportsBoard: true,
      },
    );

    expect(scoped).toEqual({
      filters: [{ field: "stage", operator: FilterOperatorKey.isNotNull }],
      searchTerm: "",
      sortDescriptor: null,
      viewMode: ViewMode.card,
      grouping: null,
      columnOrder: ["value"],
      columnWidths: { value: 90 },
      hiddenColumns: ["value"],
    });
  });

  it("opens a board as a table where the recipient has no board", () => {
    expect(
      scopeSharedViewState(
        { viewMode: ViewMode.card, pageSize: 5 },
        { columnIds: new Set(), groupings: [], sortableColumnIds: new Set(), supportsBoard: false },
      ),
    ).toMatchObject({ viewMode: ViewMode.table, pageSize: 5 });
  });
});
