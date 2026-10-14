import { FilterFieldKey } from "@/core/types/filter-field-key";
import { describe, expect, it } from "vitest";
import { resolveGroupAxis, resolveGrouping } from "../group-axis";
import { dateGroupable, enumGroupable, relationGroupable } from "../groupable-field";
import { MAX_AXIS_GROUPS, NO_VALUE_GROUP_KEY } from "../grouping.schema";

const collator = new Intl.Collator("en");
describe("system grouping axes", () => {
  it("includes zero-count enum groups in their declared order", () => {
    const spec = enumGroupable({ model: "user", field: "status" });
    const axis = resolveGroupAxis({ spec, rows: [{ key: "active", count: 2 }], labels: new Map(), collator });
    if (spec.kind !== "enum") throw new Error("Expected enum");
    expect(axis.groups.map((group) => group.key)).toEqual(spec.values);
    expect(axis.groups.find((group) => group.key === "active")?.count).toBe(2);
    expect(axis.groups.filter((group) => group.key !== "active").every((group) => group.count === 0)).toBe(true);
  });
  it("shows only accessible relation labels and preserves the unassigned group", () => {
    const axis = resolveGroupAxis({
      spec: relationGroupable({ model: "routine", field: "ownerUserId" }),
      rows: [
        { key: "restricted", count: 10 },
        { key: "a", count: 2 },
        { key: "b", count: 1 },
        { key: NO_VALUE_GROUP_KEY, count: 3 },
      ],
      labels: new Map([
        ["a", { label: "Zara" }],
        ["b", { label: "Ada" }],
      ]),
      collator,
    });
    expect(axis.groups.map((group) => group.key)).toEqual(["b", "a", NO_VALUE_GROUP_KEY]);
  });
  it("rejects undeclared grouping fields and normalizes an invalid date bucket", () => {
    const spec = dateGroupable({ model: "user", field: FilterFieldKey.createdAt });
    expect(resolveGrouping({ field: "missing" }, [spec])).toBeUndefined();
    expect(
      resolveGrouping({ field: FilterFieldKey.createdAt, hidden: ["2026-10-01"], hideEmpty: true }, [spec]),
    ).toMatchObject({
      grouping: { field: FilterFieldKey.createdAt, bucket: "month", hidden: ["2026-10-01"], hideEmpty: true },
    });
    expect(resolveGrouping({ field: FilterFieldKey.createdAt, bucket: "invalid" as never }, [spec])).toMatchObject({
      grouping: { field: FilterFieldKey.createdAt, bucket: "month" },
    });
  });
  it("reports a truncated relation axis as holding records past the cap", () => {
    const rows = Array.from({ length: MAX_AXIS_GROUPS + 3 }, (_unused, index) => ({ key: `u${index}`, count: 1 }));
    const axis = resolveGroupAxis({
      spec: relationGroupable({ model: "routine", field: "ownerUserId" }),
      rows,
      labels: new Map(rows.map((row) => [row.key, { label: row.key }])),
      collator,
    });
    expect(axis.groups).toHaveLength(MAX_AXIS_GROUPS);
    expect(axis.overflow).toEqual({ shown: MAX_AXIS_GROUPS, withRecords: true });
  });
  it("does not report overflow for an axis within the cap", () => {
    const spec = enumGroupable({ model: "user", field: "status" });
    expect(resolveGroupAxis({ spec, rows: [], labels: new Map(), collator }).overflow).toBeUndefined();
  });
});
