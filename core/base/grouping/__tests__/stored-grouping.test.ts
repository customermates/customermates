import { describe, expect, it } from "vitest";

import { ViewMode } from "@/core/base/base-query-builder";
import { CLEARED_GROUPING, groupingShadowColumnId, readStoredGrouping } from "../stored-grouping";

const A_COLUMN_ID = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e";

describe("readStoredGrouping", () => {
  it("returns a stored descriptor verbatim, bucket included", () => {
    expect(readStoredGrouping({ field: A_COLUMN_ID }, null, ViewMode.card)).toEqual({ field: A_COLUMN_ID });
    expect(readStoredGrouping({ field: "createdAt", bucket: "month" }, null, ViewMode.table)).toEqual({
      field: "createdAt",
      bucket: "month",
    });
  });

  it("reads the cleared sentinel as an explicit null rather than as an absent field", () => {
    expect(readStoredGrouping(CLEARED_GROUPING, null, ViewMode.card)).toBeNull();
    expect(readStoredGrouping({}, A_COLUMN_ID, ViewMode.card)).toBeNull();
  });

  it("keeps reading the legacy empty string shadow as an explicit clear", () => {
    expect(readStoredGrouping(null, "", ViewMode.card)).toBeNull();
    expect(readStoredGrouping(null, "", ViewMode.table)).toBeNull();
  });

  it("lifts a legacy column id only on a stored board", () => {
    expect(readStoredGrouping(null, A_COLUMN_ID, ViewMode.card)).toEqual({ field: A_COLUMN_ID });
    expect(readStoredGrouping(null, A_COLUMN_ID, ViewMode.table)).toBeUndefined();
    expect(readStoredGrouping(null, A_COLUMN_ID, null)).toBeUndefined();
  });

  it("falls back to the legacy column instead of throwing on malformed stored json", () => {
    expect(readStoredGrouping("not-json-object", A_COLUMN_ID, ViewMode.card)).toEqual({ field: A_COLUMN_ID });
    expect(readStoredGrouping({ field: 7 }, A_COLUMN_ID, ViewMode.card)).toEqual({ field: A_COLUMN_ID });
    expect(readStoredGrouping([{ field: A_COLUMN_ID }], null, ViewMode.card)).toBeUndefined();
  });

  it("says nothing about grouping when neither the descriptor nor the legacy column is set", () => {
    expect(readStoredGrouping(null, null, ViewMode.card)).toBeUndefined();
  });
});

describe("groupingShadowColumnId", () => {
  it("derives the indexed shadow only from a custom column descriptor", () => {
    expect(groupingShadowColumnId({ field: A_COLUMN_ID })).toBe(A_COLUMN_ID);
    expect(groupingShadowColumnId({ field: "userIds" })).toBeNull();
    expect(groupingShadowColumnId({ field: "createdAt", bucket: "day" })).toBeNull();
    expect(groupingShadowColumnId(null)).toBeNull();
    expect(groupingShadowColumnId(undefined)).toBeNull();
  });
});
