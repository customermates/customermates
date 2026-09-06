import { describe, expect, it } from "vitest";

import {
  DATE_BUCKETS,
  GROUP_PAGE_SIZE_MAX,
  GroupPageRequestSchema,
  GroupingSchema,
  NO_VALUE_GROUP_KEY,
  decodeGroupingToken,
  encodeGroupingToken,
  groupingForField,
  sameGrouping,
} from "../grouping.schema";

const A_COLUMN_ID = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e";

describe("GroupingSchema", () => {
  it("accepts a bare field and a bucketed field", () => {
    expect(GroupingSchema.parse({ field: A_COLUMN_ID })).toEqual({ field: A_COLUMN_ID });
    expect(GroupingSchema.parse({ field: "createdAt", bucket: "month" })).toEqual({
      field: "createdAt",
      bucket: "month",
    });
  });

  it("survives a mobx toJS round trip that carries an undefined bucket", () => {
    const parsed = GroupingSchema.safeParse({ field: A_COLUMN_ID, bucket: undefined });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ field: A_COLUMN_ID });
  });

  it("strips unknown keys rather than rejecting the whole descriptor", () => {
    expect(GroupingSchema.parse({ field: "createdAt", kind: "dateBucket" })).toEqual({ field: "createdAt" });
  });

  it("rejects an empty field, an over long field, an unknown bucket and a non object", () => {
    expect(GroupingSchema.safeParse({ field: "" }).success).toBe(false);
    expect(GroupingSchema.safeParse({ field: "f".repeat(201) }).success).toBe(false);
    expect(GroupingSchema.safeParse({ field: "createdAt", bucket: "decade" }).success).toBe(false);
    expect(GroupingSchema.safeParse(null).success).toBe(false);
    expect(GroupingSchema.safeParse({}).success).toBe(false);
  });

  it("declares the three date buckets", () => {
    expect(DATE_BUCKETS).toEqual(["day", "week", "month"]);
  });
});

describe("grouping constants", () => {
  it("keeps the persisted no-value key stable", () => {
    expect(NO_VALUE_GROUP_KEY).toBe("__empty__");
  });
});

describe("groupingForField", () => {
  it("keeps undefined, null and a field distinct so a param layer can defer or clear", () => {
    expect(groupingForField(undefined)).toBeUndefined();
    expect(groupingForField(null)).toBeNull();
    expect(groupingForField("")).toBeNull();
    expect(groupingForField(A_COLUMN_ID)).toEqual({ field: A_COLUMN_ID });
  });
});

describe("sameGrouping", () => {
  it("compares field and bucket and treats null and undefined as the same absence", () => {
    expect(sameGrouping(undefined, null)).toBe(true);
    expect(sameGrouping({ field: "createdAt" }, { field: "createdAt" })).toBe(true);
    expect(sameGrouping({ field: "createdAt" }, { field: "createdAt", bucket: "day" })).toBe(false);
    expect(sameGrouping({ field: "createdAt" }, null)).toBe(false);
  });
});

describe("grouping url token", () => {
  it("round trips a bare field and a bucketed field", () => {
    expect(encodeGroupingToken({ field: A_COLUMN_ID })).toBe(A_COLUMN_ID);
    expect(encodeGroupingToken({ field: "createdAt", bucket: "week" })).toBe("createdAt:week");
    expect(decodeGroupingToken(A_COLUMN_ID)).toEqual({ field: A_COLUMN_ID });
    expect(decodeGroupingToken("createdAt:week")).toEqual({ field: "createdAt", bucket: "week" });
  });

  it("leaves an unknown bucket in the field so resolution fails closed instead of guessing", () => {
    expect(decodeGroupingToken("createdAt:decade")).toEqual({ field: "createdAt:decade" });
  });

  it("returns undefined for an empty or over long token", () => {
    expect(decodeGroupingToken("")).toBeUndefined();
    expect(decodeGroupingToken(null)).toBeUndefined();
    expect(decodeGroupingToken("f".repeat(201))).toBeUndefined();
  });
});

describe("GroupPageRequestSchema", () => {
  it("accepts a page request and bounds every per group size", () => {
    expect(
      GroupPageRequestSchema.parse({
        perGroup: 10,
        overrides: { won: 50 },
        collapsed: ["lost"],
        only: "won",
        includeValueSums: true,
      }),
    ).toEqual({ perGroup: 10, overrides: { won: 50 }, collapsed: ["lost"], only: "won", includeValueSums: true });
    expect(GroupPageRequestSchema.safeParse({ perGroup: GROUP_PAGE_SIZE_MAX + 1 }).success).toBe(false);
    expect(GroupPageRequestSchema.safeParse({ overrides: { won: 0 } }).success).toBe(false);
  });
});
