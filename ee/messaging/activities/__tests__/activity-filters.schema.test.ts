import { describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { CustomErrorCode } from "@/core/validation/validation.types";

import {
  ActivitiesApiParamsSchema,
  ActivitiesParamsSchema,
  ActivityFilterSchema,
  ActivityFiltersSchema,
} from "../activities.schema";

const A = "16000000-0000-4000-8000-000000000001";
const RELATIONSHIP_FIELDS = [
  FilterFieldKey.contactIds,
  FilterFieldKey.organizationIds,
  FilterFieldKey.dealIds,
  FilterFieldKey.serviceIds,
  FilterFieldKey.taskIds,
] as const;

const UNIQUE_FILTERS = [
  {
    field: FilterFieldKey.timelineKind,
    operator: FilterOperatorKey.in,
    value: ["changes"],
  },
  {
    field: FilterFieldKey.timelineThreadId,
    operator: FilterOperatorKey.in,
    value: [A],
  },
  {
    field: FilterFieldKey.provider,
    operator: FilterOperatorKey.in,
    value: ["google"],
  },
  {
    field: FilterFieldKey.connectedAccountId,
    operator: FilterOperatorKey.notIn,
    value: [A],
  },
  ...RELATIONSHIP_FIELDS.map((field) => ({
    field,
    operator: FilterOperatorKey.hasSome,
  })),
];

describe("ActivityFilterSchema relationship filters", () => {
  it.each(RELATIONSHIP_FIELDS)("accepts all relationship operators for %s", (field) => {
    expect(
      ActivityFilterSchema.safeParse({
        field,
        operator: FilterOperatorKey.in,
        value: [A],
      }).success,
    ).toBe(true);
    expect(
      ActivityFilterSchema.safeParse({
        field,
        operator: FilterOperatorKey.notIn,
        value: [A],
      }).success,
    ).toBe(true);
    expect(
      ActivityFilterSchema.safeParse({
        field,
        operator: FilterOperatorKey.hasSome,
      }).success,
    ).toBe(true);
    expect(
      ActivityFilterSchema.safeParse({
        field,
        operator: FilterOperatorKey.hasNone,
      }).success,
    ).toBe(true);
  });

  it.each(RELATIONSHIP_FIELDS)("requires 1-50 strict UUID values for membership on %s", (field) => {
    expect(
      ActivityFilterSchema.safeParse({
        field,
        operator: FilterOperatorKey.in,
        value: [],
      }).success,
    ).toBe(false);
    expect(
      ActivityFilterSchema.safeParse({
        field,
        operator: FilterOperatorKey.in,
        value: Array.from({ length: 51 }, () => A),
      }).success,
    ).toBe(false);
    expect(
      ActivityFilterSchema.safeParse({
        field,
        operator: FilterOperatorKey.in,
        value: ["raw-id"],
      }).success,
    ).toBe(false);
  });

  it.each(RELATIONSHIP_FIELDS)("rejects values on value-less operators for %s", (field) => {
    expect(
      ActivityFilterSchema.safeParse({
        field,
        operator: FilterOperatorKey.hasSome,
        value: [A],
      }).success,
    ).toBe(false);
    expect(
      ActivityFilterSchema.safeParse({
        field,
        operator: FilterOperatorKey.hasNone,
        value: [A],
      }).success,
    ).toBe(false);
  });

  it("accepts one rule for each supported field", () => {
    expect(ActivityFiltersSchema.safeParse(UNIQUE_FILTERS).success).toBe(true);
    expect(ActivitiesParamsSchema.safeParse({ filters: UNIQUE_FILTERS }).success).toBe(true);
    expect(ActivitiesApiParamsSchema.safeParse({ filters: UNIQUE_FILTERS }).success).toBe(true);
  });

  it.each([ActivitiesParamsSchema, ActivitiesApiParamsSchema])(
    "rejects duplicate fields at the second field path",
    (schema) => {
      const result = schema.safeParse({
        filters: [
          {
            field: FilterFieldKey.contactIds,
            operator: FilterOperatorKey.in,
            value: [A],
          },
          {
            field: FilterFieldKey.contactIds,
            operator: FilterOperatorKey.in,
            value: [A],
          },
        ],
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      const issue = result.error.issues.find((candidate) => candidate.path.join(".") === "filters.1.field");
      expect(issue).toMatchObject({
        code: "custom",
        path: ["filters", 1, "field"],
        params: { error: CustomErrorCode.activityDuplicateFilterField },
      });
    },
  );

  it.each([ActivitiesParamsSchema, ActivitiesApiParamsSchema])(
    "rejects mixed-operator duplicates for the same field",
    (schema) => {
      const result = schema.safeParse({
        filters: [
          {
            field: FilterFieldKey.dealIds,
            operator: FilterOperatorKey.in,
            value: [A],
          },
          {
            field: FilterFieldKey.dealIds,
            operator: FilterOperatorKey.hasNone,
          },
        ],
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          code: "custom",
          path: ["filters", 1, "field"],
          params: { error: CustomErrorCode.activityDuplicateFilterField },
        }),
      );
    },
  );

  it("keeps the defensive fifty-filter request limit", () => {
    const filter = {
      field: FilterFieldKey.contactIds,
      operator: FilterOperatorKey.hasSome,
    };

    const result = ActivityFiltersSchema.safeParse(Array.from({ length: 51 }, () => filter));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(expect.objectContaining({ code: "too_big" }));
  });

  describe.each(RELATIONSHIP_FIELDS)("%s relationship existence", (field) => {
    it.each([FilterOperatorKey.hasSome, FilterOperatorKey.hasNone])(
      "accepts %s carrying the explicit undefined value the filter modal emits",
      (operator) => {
        const fromModal = { field, operator, value: undefined };

        expect("value" in fromModal).toBe(true);
        expect(ActivityFiltersSchema.parse([fromModal])).toEqual([{ field, operator }]);
      },
    );

    it.each([FilterOperatorKey.hasSome, FilterOperatorKey.hasNone])(
      "still rejects %s carrying a real value instead of widening it",
      (operator) => {
        expect(ActivityFiltersSchema.safeParse([{ field, operator, value: [A] }]).success).toBe(false);
      },
    );
  });
});
