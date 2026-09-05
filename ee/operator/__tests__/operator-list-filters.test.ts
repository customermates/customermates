import type { Filter } from "@/core/base/base-get.schema";
import type { GroupableFieldSpec } from "@/core/base/grouping/groupable-field";
import type { GroupScope } from "@/core/base/grouping/group-scope";

import { describe, expect, it, vi } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { dateBucketLadder } from "@/core/base/grouping/date-buckets";
import { dateGroupables, enumGroupables, relationGroupable } from "@/core/base/grouping/groupable-field";
import { NO_VALUE_GROUP_KEY } from "@/core/base/grouping/grouping.schema";

import {
  applyGroupScopeAsFilters,
  countOperatorGroups,
  groupScopeToFilters,
  operatorCollator,
  partitionOperatorUserFilters,
  partitionOperatorWorkspaceFilters,
  planOperatorAuditFilters,
} from "../operator-list-filters";

const NOW = "2026-09-05T12:00:00.000Z";

const [status, plan] = enumGroupables("user", { status: true, plan: true, subscriptionStatus: false });
const [createdAt] = dateGroupables("company", { createdAt: true, updatedAt: false });
const ladder = dateBucketLadder("month", new Date(NOW));
const scope = (spec: GroupableFieldSpec, key: string): GroupScope => ({ spec, key, bucket: "month", now: NOW });

describe("groupScopeToFilters", () => {
  it("turns an enum key into the in filter the repository already accepts", () => {
    expect(groupScopeToFilters(scope(status, "inactive"))).toEqual([
      { field: "status", operator: FilterOperatorKey.in, value: ["inactive"] },
    ]);
  });

  it("turns the no-value key of a nullable enum into notIn over every value, which the partition reads as no subscription", () => {
    expect(groupScopeToFilters(scope(plan, NO_VALUE_GROUP_KEY))).toEqual([
      { field: "plan", operator: FilterOperatorKey.notIn, value: ["starter", "pro", "business", "enterprise"] },
    ]);
  });

  it("matches nothing for the no-value key of a required enum and for a key outside the enum", () => {
    expect(groupScopeToFilters(scope(status, NO_VALUE_GROUP_KEY))).toBeUndefined();
    expect(groupScopeToFilters(scope(status, "gold"))).toBeUndefined();
    expect(groupScopeToFilters(scope(plan, "gold"))).toBeUndefined();
  });

  it("turns a date window into gte and lt on the column, and the open ends into one bound", () => {
    const thisMonth = ladder[1];
    expect(groupScopeToFilters(scope(createdAt, thisMonth.key))).toEqual([
      { field: "createdAt", operator: FilterOperatorKey.gte, value: thisMonth.start?.toISOString() },
      { field: "createdAt", operator: FilterOperatorKey.lt, value: thisMonth.end?.toISOString() },
    ]);
    expect(groupScopeToFilters(scope(createdAt, "later"))).toEqual([
      { field: "createdAt", operator: FilterOperatorKey.gte, value: ladder[0].start?.toISOString() },
    ]);
    expect(groupScopeToFilters(scope(createdAt, "earlier"))).toEqual([
      { field: "createdAt", operator: FilterOperatorKey.lt, value: ladder[ladder.length - 1].end?.toISOString() },
    ]);
    expect(groupScopeToFilters(scope(createdAt, "week:2026-08-31T00:00:00.000Z"))).toBeUndefined();
  });

  it("refuses the kinds no operator list declares", () => {
    expect(() => groupScopeToFilters(scope(relationGroupable({ model: "deal", field: "userIds" }), "x"))).toThrow(
      "Operator lists cannot group by relation (deal.userIds)",
    );
  });
});

describe("applyGroupScopeAsFilters", () => {
  it("strips the scope and appends its filters after the caller's own", () => {
    const own: Filter = { field: "workspaceId", operator: FilterOperatorKey.in, value: ["w1"] };

    expect(
      applyGroupScopeAsFilters({ filters: [own], take: 11, skip: 0, groupScope: scope(status, "active") }),
    ).toEqual({
      filters: [own, { field: "status", operator: FilterOperatorKey.in, value: ["active"] }],
      take: 11,
      skip: 0,
    });
  });

  it("leaves an unscoped request untouched and reports a scope that matches nothing as undefined", () => {
    expect(applyGroupScopeAsFilters({ searchTerm: "ada" })).toEqual({ searchTerm: "ada" });
    expect(applyGroupScopeAsFilters({ groupScope: scope(status, "gold") })).toBeUndefined();
  });
});

describe("countOperatorGroups", () => {
  it("counts every enum value plus the no-value group of a nullable enum, in axis order", async () => {
    const count = vi.fn((groupScope: GroupScope) => Promise.resolve(groupScope.key.length));

    await expect(countOperatorGroups(plan, undefined, NOW, count)).resolves.toEqual([
      { key: "starter", count: 7 },
      { key: "pro", count: 3 },
      { key: "business", count: 8 },
      { key: "enterprise", count: 10 },
      { key: NO_VALUE_GROUP_KEY, count: NO_VALUE_GROUP_KEY.length },
    ]);
    expect(count.mock.calls.map(([groupScope]) => groupScope)).toEqual(
      ["starter", "pro", "business", "enterprise", NO_VALUE_GROUP_KEY].map((key) => ({
        spec: plan,
        key,
        bucket: undefined,
        now: NOW,
      })),
    );
    await expect(countOperatorGroups(status, undefined, NOW, () => Promise.resolve(1))).resolves.toHaveLength(3);
  });

  it("counts once per ladder entry for a date bucket", async () => {
    const rows = await countOperatorGroups(createdAt, "month", NOW, () => Promise.resolve(2));

    expect(rows.map(({ key }) => key)).toEqual(ladder.map(({ key }) => key));
    expect(rows.every(({ count }) => count === 2)).toBe(true);
  });
});

const ALL_PLANS = ["starter", "pro", "business", "enterprise"];
const notStarter: Filter = { field: "plan", operator: FilterOperatorKey.notIn, value: ["starter"] };
const onlyPro: Filter = { field: "plan", operator: FilterOperatorKey.in, value: ["pro"] };
const notTrial: Filter = { field: "subscriptionStatus", operator: FilterOperatorKey.notIn, value: ["trial"] };
const scopedFilters = (own: Filter[], groupScope: GroupScope) =>
  applyGroupScopeAsFilters({ filters: own, groupScope })?.filters;

describe("partitionOperatorUserFilters with a group scope on an intercepted field", () => {
  it("intersects an own negated plan filter with the group's positive plan filter", () => {
    const { baseWhere, passthrough } = partitionOperatorUserFilters(
      scopedFilters([notStarter], scope(plan, "starter")),
    );

    expect(passthrough).toEqual([]);
    expect(baseWhere).toEqual({
      company: { subscription: { is: { AND: [{ plan: { notIn: ["starter"] } }, { plan: { in: ["starter"] } }] } } },
    });
  });

  it("keeps the no-subscription branch when both the own filter and the no-value scope are negated", () => {
    const { baseWhere } = partitionOperatorUserFilters(scopedFilters([notStarter], scope(plan, NO_VALUE_GROUP_KEY)));

    const is = { AND: [{ plan: { notIn: ["starter"] } }, { plan: { notIn: ALL_PLANS } }] };
    expect(baseWhere).toEqual({
      OR: [{ company: { subscription: { is } } }, { company: { subscription: { is: null } } }],
    });
  });

  it("drops the no-subscription branch when an own positive filter meets the no-value scope", () => {
    const { baseWhere } = partitionOperatorUserFilters(scopedFilters([onlyPro], scope(plan, NO_VALUE_GROUP_KEY)));

    expect(baseWhere).toEqual({
      company: { subscription: { is: { AND: [{ plan: { in: ["pro"] } }, { plan: { notIn: ALL_PLANS } }] } } },
    });
  });

  it("keeps the flat shape for a single condition and combines different subscription fields", () => {
    expect(partitionOperatorUserFilters([notStarter]).baseWhere).toEqual({
      OR: [
        { company: { subscription: { is: { plan: { notIn: ["starter"] } } } } },
        { company: { subscription: { is: null } } },
      ],
    });
    expect(partitionOperatorUserFilters([onlyPro, notTrial]).baseWhere).toEqual({
      company: { subscription: { is: { AND: [{ plan: { in: ["pro"] } }, { status: { notIn: ["trial"] } }] } } },
    });
  });
});

describe("partitionOperatorWorkspaceFilters with a group scope on an intercepted field", () => {
  const [companyPlan] = enumGroupables("company", { plan: true, subscriptionStatus: false });

  it("intersects an own negated plan filter with the group's positive plan filter", () => {
    const { baseWhere, passthrough } = partitionOperatorWorkspaceFilters(
      scopedFilters([notStarter], scope(companyPlan, "starter")),
    );

    expect(passthrough).toEqual([]);
    expect(baseWhere).toEqual({
      subscription: { is: { AND: [{ plan: { notIn: ["starter"] } }, { plan: { in: ["starter"] } }] } },
    });
  });

  it("keeps the no-subscription branch when both conditions are negated", () => {
    const { baseWhere } = partitionOperatorWorkspaceFilters(
      scopedFilters([notStarter], scope(companyPlan, NO_VALUE_GROUP_KEY)),
    );

    const is = { AND: [{ plan: { notIn: ["starter"] } }, { plan: { notIn: ALL_PLANS } }] };
    expect(baseWhere).toEqual({ OR: [{ subscription: { is } }, { subscription: { is: null } }] });
  });
});

describe("planOperatorAuditFilters", () => {
  const [auditSource] = enumGroupables("operatorAudit", { auditSource: true });
  const [auditCreatedAt] = dateGroupables("operatorAudit", { createdAt: true, updatedAt: false });
  const notProduct: Filter = { field: "auditSource", operator: FilterOperatorKey.notIn, value: ["product"] };

  it("intersects the source sets of an own negated filter and the group's positive filter", () => {
    expect(planOperatorAuditFilters(scopedFilters([notProduct], scope(auditSource, "product"))).sources).toEqual([]);
    expect(planOperatorAuditFilters(scopedFilters([notProduct], scope(auditSource, "operator"))).sources).toEqual([
      "operator",
    ]);
    expect(planOperatorAuditFilters([notProduct]).sources).toEqual(["operator"]);
    expect(planOperatorAuditFilters(undefined).sources).toEqual(["product", "operator"]);
  });

  it("keeps every createdAt range so the group window narrows the own filter instead of replacing it", () => {
    const since: Filter = { field: "createdAt", operator: FilterOperatorKey.gte, value: "2026-08-15T00:00:00.000Z" };
    const thisMonth = ladder[1];

    expect(planOperatorAuditFilters(scopedFilters([since], scope(auditCreatedAt, thisMonth.key))).createdAt).toEqual([
      { gte: new Date("2026-08-15T00:00:00.000Z") },
      { gte: thisMonth.start },
      { lt: thisMonth.end },
    ]);
  });

  it("keeps positive workspace filters and ignores negated ones", () => {
    const own: Filter = { field: "workspaceId", operator: FilterOperatorKey.in, value: ["w1"] };
    const negatedWorkspace: Filter = { field: "workspaceId", operator: FilterOperatorKey.notIn, value: ["w2"] };

    expect(planOperatorAuditFilters([own, negatedWorkspace]).workspaceIds).toEqual(["w1"]);
  });
});

describe("operatorCollator", () => {
  it("compares plainly without touching the tenant user", () => {
    const { compare } = operatorCollator();

    expect(["b", "a", "c"].sort(compare)).toEqual(["a", "b", "c"]);
    expect(compare("a", "a")).toBe(0);
  });
});
