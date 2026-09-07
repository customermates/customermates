import { describe, expect, it } from "vitest";

import { groupingShadowColumnId, readStoredGrouping } from "../stored-grouping";

const A_COLUMN_ID = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e";

describe("readStoredGrouping", () => {
  it("returns a stored descriptor verbatim, bucket included", () => {
    expect(readStoredGrouping({ field: A_COLUMN_ID })).toEqual({ field: A_COLUMN_ID });
    expect(readStoredGrouping({ field: "createdAt", bucket: "month" })).toEqual({
      field: "createdAt",
      bucket: "month",
    });
  });

  it("says nothing about grouping for a null column", () => {
    expect(readStoredGrouping(null)).toBeUndefined();
  });

  it("says nothing about grouping instead of throwing on malformed stored json", () => {
    expect(readStoredGrouping("not-json-object")).toBeUndefined();
    expect(readStoredGrouping({})).toBeUndefined();
    expect(readStoredGrouping({ field: 7 })).toBeUndefined();
    expect(readStoredGrouping([{ field: A_COLUMN_ID }])).toBeUndefined();
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
