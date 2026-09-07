import type { GroupableFieldSpec } from "../groupable-field";

import { describe, expect, it } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { FilterFieldKey } from "@/core/types/filter-field-key";

import { NO_VALUE_GROUP_KEY } from "../grouping.schema";
import { customSelectGroupable, dateGroupable, enumGroupable, relationGroupable } from "../groupable-field";
import { dateBucketLadder } from "../date-buckets";
import { groupScopeFragment, withFragment } from "../group-scope";

const COLUMN_ID = "22222222-2222-4222-8222-222222222222";
const COMPANY_ID = "company-1";
const USER_ID = "user-1";

const targetWhere = () => ({ companyId: COMPANY_ID });
const readOwnTargetWhere = () => ({ companyId: COMPANY_ID, users: { some: { userId: USER_ID } } });

function stageSpec(): GroupableFieldSpec {
  return customSelectGroupable({
    column: {
      id: COLUMN_ID,
      label: "Stage",
      entityType: EntityType.deal,
      type: CustomColumnType.singleSelect,
      options: { options: [{ value: "won", label: "Won", color: "success", isDefault: false, index: 0 }] },
    },
    model: "deal",
    entityType: EntityType.deal,
  });
}

describe("withFragment keeps the tenant guard satisfied", () => {
  it("leaves the top level untouched so companyId stays where the guard reads it", () => {
    const scoped = { companyId: COMPANY_ID, users: { some: { userId: USER_ID } } };

    expect(withFragment(scoped, { name: "x" })).toEqual({
      companyId: COMPANY_ID,
      users: { some: { userId: USER_ID } },
      AND: [{ name: "x" }],
    });
  });

  it("appends to an existing AND rather than replacing it", () => {
    const scoped = { companyId: COMPANY_ID, AND: [{ a: 1 }] };

    expect(withFragment(scoped, { b: 2 }).AND).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("wraps a non array AND before appending", () => {
    const scoped = { companyId: COMPANY_ID, AND: { a: 1 } };

    expect(withFragment(scoped, { b: 2 }).AND).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("cannot overwrite the readOwn clause the unassigned fragment would collide with", () => {
    const scoped: Record<string, unknown> = { companyId: COMPANY_ID, users: { some: { userId: USER_ID } } };
    const merged = withFragment(scoped, { users: { none: { user: readOwnTargetWhere() } } });

    expect(merged.users).toEqual({ some: { userId: USER_ID } });
    expect(merged.AND).toEqual([{ users: { none: { user: readOwnTargetWhere() } } }]);
  });
});

describe("groupScopeFragment builds count and item page from the same key", () => {
  it("compiles a custom single select value and its empty variant", () => {
    const spec = stageSpec();

    expect(groupScopeFragment({ spec, key: "won" }, targetWhere)).toEqual({
      customFieldValues: { some: { AND: [{ columnId: COLUMN_ID }, { value: { in: ["won"] } }] } },
    });
    expect(groupScopeFragment({ spec, key: NO_VALUE_GROUP_KEY }, targetWhere)).toEqual({
      customFieldValues: { none: { AND: [{ columnId: COLUMN_ID }, { value: { not: null } }] } },
    });
  });

  it("compiles an enum value and its null variant", () => {
    const spec = enumGroupable({ model: "task", field: "type" });

    expect(groupScopeFragment({ spec, key: "custom" }, targetWhere)).toEqual({ type: "custom" });
    expect(groupScopeFragment({ spec, key: NO_VALUE_GROUP_KEY }, targetWhere)).toEqual({ type: null });
  });

  it("carries the target access scope on both the relation value and the unassigned fragment", () => {
    const spec = relationGroupable({ model: "deal", field: FilterFieldKey.userIds });

    expect(groupScopeFragment({ spec, key: USER_ID }, targetWhere)).toEqual({
      users: { some: { userId: USER_ID, user: { companyId: COMPANY_ID } } },
    });
    expect(groupScopeFragment({ spec, key: NO_VALUE_GROUP_KEY }, targetWhere)).toEqual({
      users: { none: { user: { companyId: COMPANY_ID } } },
    });
  });

  it("tiles the ladder with half open windows so no record falls in two buckets or none", () => {
    const spec = dateGroupable({ model: "deal", field: FilterFieldKey.createdAt });
    const now = "2026-03-15T12:00:00.000Z";
    const ranges = dateBucketLadder("month", new Date(now)).map(
      (entry) =>
        (
          groupScopeFragment({ spec, key: entry.key, bucket: "month", now }, targetWhere) as {
            createdAt: { gte?: Date; lt?: Date };
          }
        ).createdAt,
    );

    for (const [index, range] of ranges.entries()) {
      const next = ranges[index + 1];
      if (!next) continue;

      expect([index, range.gte?.toISOString()]).toEqual([index, next.lt?.toISOString()]);
    }

    expect(ranges).toHaveLength(14);
  });

  it("bounds the ladder ends on one side only", () => {
    const spec = dateGroupable({ model: "deal", field: FilterFieldKey.createdAt });
    const now = "2026-03-15T12:00:00.000Z";

    const later = groupScopeFragment({ spec, key: "later", bucket: "month", now }, targetWhere) as {
      createdAt: Record<string, Date>;
    };
    const earlier = groupScopeFragment({ spec, key: "earlier", bucket: "month", now }, targetWhere) as {
      createdAt: Record<string, Date>;
    };

    expect(Object.keys(later.createdAt)).toEqual(["gte"]);
    expect(Object.keys(earlier.createdAt)).toEqual(["lt"]);
    expect(later.createdAt.gte.getTime()).toBeGreaterThan(earlier.createdAt.lt.getTime());
  });

  it("matches nothing for a date key the ladder cannot resolve", () => {
    const spec = dateGroupable({ model: "deal", field: FilterFieldKey.createdAt });

    expect(groupScopeFragment({ spec, key: "week:nonsense", bucket: "month" }, targetWhere)).toEqual({
      id: { in: [] },
    });
  });

  it("throws through the exhaustive branch when a fifth kind reaches it", () => {
    const unknown = { kind: "histogram", field: "amount", model: "deal" } as unknown as GroupableFieldSpec;

    expect(() => groupScopeFragment({ spec: unknown, key: "x" }, targetWhere)).toThrow();
  });
});
