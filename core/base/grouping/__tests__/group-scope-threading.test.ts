import type { FilterableField, GetQueryParams } from "@/core/base/base-get.schema";
import type { GroupingTargetModel } from "../groupable-field";

import { describe, expect, it } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

import { BaseQueryBuilder, FilterOperatorKey } from "@/core/base/base-query-builder";
import { NO_VALUE_GROUP_KEY } from "../grouping.schema";
import { customSelectGroupable, enumGroupable, relationGroupable } from "../groupable-field";

const COLUMN_ID = "66666666-6666-4666-8666-666666666666";
const COMPANY_ID = "company-1";
const USER_ID = "user-1";

class ProbeBuilder extends BaseQueryBuilder<Record<string, unknown>> {
  override getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve([{ field: COLUMN_ID, operators: [FilterOperatorKey.in, FilterOperatorKey.isNull] }]);
  }

  override getCustomColumns() {
    return Promise.resolve([
      {
        id: COLUMN_ID,
        label: "Stage",
        entityType: EntityType.deal,
        type: CustomColumnType.singleSelect,
        options: { options: [] },
      },
    ] as never);
  }

  protected override groupTargetWhere(model: GroupingTargetModel): Record<string, unknown> {
    return model === "user" ? { companyId: COMPANY_ID, id: USER_ID } : { companyId: COMPANY_ID };
  }

  whereFor(params: GetQueryParams) {
    return this.buildQueryArgs(params, { companyId: COMPANY_ID, users: { some: { userId: USER_ID } } });
  }
}

function stageSpec() {
  return customSelectGroupable({
    column: {
      id: COLUMN_ID,
      label: "Stage",
      entityType: EntityType.deal,
      type: CustomColumnType.singleSelect,
      options: { options: [] },
    },
    model: "deal",
    entityType: EntityType.deal,
  });
}

describe("the group scope reaches the item query without travelling through the filter channel", () => {
  it("scopes a field that is not filterable at all, which validateFilters would have dropped", async () => {
    const spec = enumGroupable({ model: "task", field: "type" });
    const { where } = await new ProbeBuilder().whereFor({ groupScope: { spec, key: "custom" } });

    expect(where.AND).toEqual([{ type: "custom" }]);
    expect(where.companyId).toBe(COMPANY_ID);
  });

  it("survives alongside a custom column filter on the same entity", async () => {
    const spec = stageSpec();
    const { where } = await new ProbeBuilder().whereFor({
      filters: [{ field: COLUMN_ID, operator: FilterOperatorKey.in, value: ["won"] }],
      groupScope: { spec, key: NO_VALUE_GROUP_KEY },
    });

    expect(where.AND).toEqual([
      { customFieldValues: { some: { AND: [{ columnId: COLUMN_ID }, { value: { in: ["won"] } }] } } },
      { customFieldValues: { none: { AND: [{ columnId: COLUMN_ID }, { value: { not: null } }] } } },
    ]);
  });

  it("keeps the access scope at the top level so the tenant guard still reads companyId", async () => {
    const spec = relationGroupable({ model: "deal", field: "userIds" });
    const { where } = await new ProbeBuilder().whereFor({ groupScope: { spec, key: NO_VALUE_GROUP_KEY } });

    expect(where.companyId).toBe(COMPANY_ID);
    expect(where.users).toEqual({ some: { userId: USER_ID } });
    expect(where.AND).toEqual([{ users: { none: { user: { companyId: COMPANY_ID, id: USER_ID } } } }]);
  });

  it("adds nothing when no group scope is threaded", async () => {
    const { where } = await new ProbeBuilder().whereFor({});

    expect(where.AND).toBeUndefined();
  });
});
