import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

import { ActivitiesApiParamsSchema, ActivitiesParamsSchema } from "../activities.schema";
import { ACTIVITY_SCOPE_MAX_IDS_PER_TYPE, ActivityScopeSchema } from "../activity-scope.schema";

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

describe("ActivityScopeSchema", () => {
  it("rejects an empty scope", () => {
    expect(ActivityScopeSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown scope properties", () => {
    expect(ActivityScopeSchema.safeParse({ entityTypes: [EntityType.contact], entityId: id(1) }).success).toBe(false);
    expect(
      ActivityScopeSchema.safeParse({
        records: [{ entityType: EntityType.contact, ids: [id(1)], label: "Contact" }],
      }).success,
    ).toBe(false);
  });

  it("bounds record ids per type", () => {
    const ids = Array.from({ length: ACTIVITY_SCOPE_MAX_IDS_PER_TYPE + 1 }, (_, index) => id(index + 1));

    expect(
      ActivityScopeSchema.safeParse({
        records: [{ entityType: EntityType.contact, ids }],
      }).success,
    ).toBe(false);
  });

  it("bounds canonical record ids across duplicate groups", () => {
    const ids = Array.from({ length: ACTIVITY_SCOPE_MAX_IDS_PER_TYPE + 1 }, (_, index) => id(index + 1));

    expect(
      ActivityScopeSchema.safeParse({
        records: [
          {
            entityType: EntityType.contact,
            ids: ids.slice(0, ACTIVITY_SCOPE_MAX_IDS_PER_TYPE),
          },
          {
            entityType: EntityType.contact,
            ids: ids.slice(ACTIVITY_SCOPE_MAX_IDS_PER_TYPE),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("deduplicates values and lets specific records narrow their type", () => {
    const first = id(1);
    const second = id(2);
    const scope = ActivityScopeSchema.parse({
      entityTypes: [EntityType.contact, EntityType.contact, EntityType.deal],
      records: [
        { entityType: EntityType.contact, ids: [first, first] },
        { entityType: EntityType.contact, ids: [second] },
      ],
    });

    expect(scope).toEqual({
      entityTypes: [EntityType.deal],
      records: [{ entityType: EntityType.contact, ids: [first, second] }],
    });
  });
});

describe("ActivitiesParamsSchema", () => {
  it("accepts page 40 and rejects page 41", () => {
    expect(
      ActivitiesParamsSchema.safeParse({
        pagination: { page: 40, pageSize: 25 },
      }).success,
    ).toBe(true);
    expect(
      ActivitiesParamsSchema.safeParse({
        pagination: { page: 41, pageSize: 25 },
      }).success,
    ).toBe(false);
  });

  it("keeps personalization out of the public API contract", () => {
    expect(ActivitiesApiParamsSchema.safeParse({ p13nId: "dashboard" }).success).toBe(false);
  });

  it("rejects unsupported search and grouped pagination inputs", () => {
    expect(ActivitiesApiParamsSchema.safeParse({ searchTerm: "customer" }).success).toBe(false);
    expect(
      ActivitiesApiParamsSchema.safeParse({
        groupedPagination: { groupingColumnId: "status", perGroup: 10 },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown properties inside activity filters", () => {
    expect(
      ActivitiesApiParamsSchema.safeParse({
        filters: [
          {
            field: FilterFieldKey.timelineKind,
            operator: FilterOperatorKey.in,
            value: ["audit"],
            searchTerm: "customer",
          },
        ],
      }).success,
    ).toBe(false);
  });
  it.each([
    ["interactive", ActivitiesParamsSchema],
    ["api", ActivitiesApiParamsSchema],
  ] as const)("reports an out-of-range page with the localized error code (%s)", (_label, schema) => {
    const result = schema.safeParse({ pagination: { page: 9999, pageSize: 25 } });

    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues).toHaveLength(1);
    expect((issues[0] as { params?: { error?: string } }).params?.error).toBe("activityPageOutOfRange");
  });
});
