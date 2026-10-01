import { FilterFieldKey } from "@/core/types/filter-field-key";
import { describe, expect, it } from "vitest";
import { resolveGroupAxis, resolveGrouping } from "../group-axis";
import { dateGroupable, enumGroupable, relationGroupable } from "../groupable-field";
import { NO_VALUE_GROUP_KEY } from "../grouping.schema";

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
    expect(resolveGrouping({ field: FilterFieldKey.createdAt, bucket: "invalid" as never }, [spec])).toMatchObject({
      grouping: { field: FilterFieldKey.createdAt, bucket: "month" },
    });
  });
});
