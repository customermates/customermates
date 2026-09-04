import type { GroupCountRow } from "../group-count";
import type { GroupLabel } from "../group-labels";
import type { GroupableFieldSpec } from "../groupable-field";

import { describe, expect, it } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { FilterFieldKey } from "@/core/types/filter-field-key";

import { MAX_AXIS_GROUPS, NO_VALUE_GROUP_KEY } from "../grouping.schema";
import { customSelectGroupable, dateGroupable, enumGroupable, relationGroupable } from "../groupable-field";
import { dateBucketLadder } from "../date-buckets";
import { resolveGroupAxis, resolveGrouping } from "../group-axis";

const COLUMN_ID = "33333333-3333-4333-8333-333333333333";
const collator = { compare: (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0) };

const option = (value: string, index: number, weight?: number) => ({
  value,
  label: value.toUpperCase(),
  color: "success" as const,
  isDefault: false,
  index,
  ...(weight === undefined ? {} : { weight }),
});

function stageSpec(options: ReturnType<typeof option>[]): GroupableFieldSpec {
  return customSelectGroupable({
    column: {
      id: COLUMN_ID,
      label: "Stage",
      entityType: EntityType.deal,
      type: CustomColumnType.singleSelect,
      options: { options },
    },
    model: "deal",
    entityType: EntityType.deal,
  });
}

function axis(spec: GroupableFieldSpec, rows: GroupCountRow[], labels = new Map<string, GroupLabel>(), extra = {}) {
  return resolveGroupAxis({ spec, rows, labels, collator, ...extra });
}

describe("the group axis is the only place group order is decided", () => {
  it("orders a single select by option index and puts the no value group last", () => {
    const spec = stageSpec([option("won", 2, 90), option("new", 0), option("qualified", 1)]);
    const { groups } = axis(spec, [
      { key: "won", count: 3 },
      { key: NO_VALUE_GROUP_KEY, count: 1 },
    ]);

    expect(groups.map((group) => group.key)).toEqual(["new", "qualified", "won", NO_VALUE_GROUP_KEY]);
    expect(groups.map((group) => group.count)).toEqual([0, 0, 3, 1]);
    expect(groups[2]).toMatchObject({ label: "WON", color: "success", weight: 90, labelKind: "value" });
    expect(groups[3]).toMatchObject({ labelKind: "noValue", isNoValue: true });
  });

  it("breaks an index tie by stored array position rather than flipping between requests", () => {
    const spec = stageSpec([option("b", 1), option("a", 1), option("c", 0)]);

    expect(axis(spec, []).groups.map((group) => group.key)).toEqual(["c", "b", "a", NO_VALUE_GROUP_KEY]);
  });

  it("renders every declared option at count zero and keeps the no value group as a drop target", () => {
    const spec = stageSpec([option("new", 0)]);
    const { groups } = axis(spec, []);

    expect(groups.map((group) => [group.key, group.count])).toEqual([
      ["new", 0],
      [NO_VALUE_GROUP_KEY, 0],
    ]);
  });

  it("renders a stored key that no option declares after the declared ones, marked unavailable", () => {
    const spec = stageSpec([option("new", 0)]);
    const { groups } = axis(spec, [
      { key: "retired", count: 2 },
      { key: "new", count: 1 },
    ]);

    expect(groups.map((group) => [group.key, group.labelKind])).toEqual([
      ["new", "value"],
      ["retired", "unavailable"],
      [NO_VALUE_GROUP_KEY, "noValue"],
    ]);
  });

  it("follows the declared enum tuple and never emits a raw enum member as a label", () => {
    const spec = enumGroupable({ model: "task", field: "type" });
    const { groups } = axis(spec, [{ key: "custom", count: 4, sums: { totalValue: 12 } }]);

    expect(groups.map((group) => group.key)).toEqual(["userPendingAuthorization", "custom"]);
    expect(groups.map((group) => group.labelKey)).toEqual([
      "Common.taskTypes.userPendingAuthorization",
      "Common.taskTypes.custom",
    ]);
    expect(groups.every((group) => group.label === undefined)).toBe(true);
    expect(groups[1].valueSums).toEqual({ totalValue: 12 });
  });

  it("omits the no value group for a non nullable enum", () => {
    const spec = enumGroupable({ model: "task", field: "type" });

    expect(axis(spec, [{ key: NO_VALUE_GROUP_KEY, count: 9 }]).groups.map((group) => group.key)).toEqual([
      "userPendingAuthorization",
      "custom",
    ]);
  });

  it("orders a relation by the resolved label, drops keys that resolved to nothing and puts no value last", () => {
    const spec = relationGroupable({ model: "deal", field: FilterFieldKey.userIds });
    const labels = new Map<string, GroupLabel>([
      ["u2", { label: "Ada Lovelace", avatarUrl: "a.png" }],
      ["u1", { label: "Zoe Zimmer", avatarUrl: null }],
    ]);
    const { groups } = axis(
      spec,
      [
        { key: "u1", count: 5 },
        { key: "u2", count: 2 },
        { key: "gone", count: 7 },
        { key: NO_VALUE_GROUP_KEY, count: 1 },
      ],
      labels,
    );

    expect(groups.map((group) => group.key)).toEqual(["u2", "u1", NO_VALUE_GROUP_KEY]);
    expect(groups[0]).toMatchObject({ label: "Ada Lovelace", avatarUrl: "a.png" });
  });

  it("omits the relation no value group when the axis did not report it", () => {
    const spec = relationGroupable({ model: "deal", field: FilterFieldKey.userIds });

    expect(axis(spec, [], new Map()).groups).toEqual([]);
  });

  it("truncates a data derived axis at the cap and reports how many groups it kept", () => {
    const spec = relationGroupable({ model: "deal", field: FilterFieldKey.userIds });
    const rows = Array.from({ length: MAX_AXIS_GROUPS + 3 }, (_unused, index) => ({
      key: `u${index}`,
      count: 1,
    }));
    const labels = new Map(rows.map((row) => [row.key, { label: row.key }]));

    const resolved = axis(spec, rows, labels);

    expect(resolved.groups).toHaveLength(MAX_AXIS_GROUPS);
    expect(resolved.overflow).toEqual({ shown: MAX_AXIS_GROUPS });
  });

  it("reports the truncation the count query already applied, not only what the axis itself cut", () => {
    const spec = relationGroupable({ model: "deal", field: FilterFieldKey.userIds });
    const rows = Array.from({ length: MAX_AXIS_GROUPS + 1 }, (_unused, index) => ({
      key: `u${index}`,
      count: 1,
    }));
    const labels = new Map(rows.slice(0, MAX_AXIS_GROUPS).map((row) => [row.key, { label: row.key }]));

    const resolved = axis(spec, rows, labels);

    expect(resolved.groups).toHaveLength(MAX_AXIS_GROUPS);
    expect(resolved.overflow).toEqual({ shown: MAX_AXIS_GROUPS });
  });

  it("runs the date ladder later, newest to oldest, earlier and carries the bucket role", () => {
    const spec = dateGroupable({ model: "deal", field: FilterFieldKey.createdAt });
    const now = "2026-03-15T12:00:00.000Z";
    const ladder = dateBucketLadder("month", new Date(now));
    const { groups } = axis(spec, [{ key: ladder[1].key, count: 4 }], new Map(), { bucket: "month", now });

    expect(groups.map((group) => group.key)).toEqual(ladder.map((entry) => entry.key));
    expect(groups.map((group) => group.bucketRole)).toEqual(ladder.map((entry) => entry.role));
    expect(groups[0].bucketRole).toBe("later");
    expect(groups[groups.length - 1].bucketRole).toBe("earlier");
    expect(groups[1].count).toBe(4);
    expect(groups.some((group) => group.isNoValue)).toBe(false);
  });

  it("throws through the exhaustive branch when a fifth kind reaches it", () => {
    const unknown = { kind: "histogram", field: "amount", model: "deal" } as unknown as GroupableFieldSpec;

    expect(() => axis(unknown, [])).toThrow();
  });
});

describe("resolveGrouping fails closed", () => {
  const specs = [stageSpec([option("new", 0)]), dateGroupable({ model: "deal", field: FilterFieldKey.createdAt })];

  it("returns undefined for a field the surface never declared", () => {
    expect(resolveGrouping({ field: "44444444-4444-4444-8444-444444444444" }, specs)).toBeUndefined();
    expect(resolveGrouping({ field: "userIds" }, specs)).toBeUndefined();
  });

  it("returns undefined when nothing is requested and when the surface declares nothing", () => {
    expect(resolveGrouping(undefined, specs)).toBeUndefined();
    expect(resolveGrouping({ field: COLUMN_ID }, [])).toBeUndefined();
  });

  it("drops a bucket on a kind that has none and defaults the bucket on a date kind", () => {
    expect(resolveGrouping({ field: COLUMN_ID, bucket: "day" }, specs)?.grouping).toEqual({ field: COLUMN_ID });
    expect(resolveGrouping({ field: "createdAt" }, specs)?.grouping).toEqual({ field: "createdAt", bucket: "month" });
    expect(resolveGrouping({ field: "createdAt", bucket: "week" }, specs)?.grouping).toEqual({
      field: "createdAt",
      bucket: "week",
    });
  });
});
