import { describe, expect, it } from "vitest";

import { FilterSchema } from "@/core/base/base-get.schema";
import { FilterOperatorKey, isStandaloneOperator } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

describe("FilterSchema relation existence operators", () => {
  it.each([FilterOperatorKey.hasNone, FilterOperatorKey.hasSome])("parses %s without a value", (operator) => {
    const filter = { field: FilterFieldKey.userIds, operator };

    expect(FilterSchema.parse(filter)).toEqual(filter);
    expect(isStandaloneOperator(operator)).toBe(true);
  });

  it("continues to require values for relation membership operators", () => {
    expect(FilterSchema.safeParse({ field: FilterFieldKey.userIds, operator: FilterOperatorKey.in }).success).toBe(
      false,
    );
    expect(FilterSchema.safeParse({ field: FilterFieldKey.userIds, operator: FilterOperatorKey.notIn }).success).toBe(
      false,
    );
  });

  it("normalizes legacy value-taking operators before parsing strips their values", () => {
    expect(
      FilterSchema.parse({
        field: FilterFieldKey.userIds,
        operator: FilterOperatorKey.hasNone,
        value: ["u1"],
      }),
    ).toEqual({
      field: FilterFieldKey.userIds,
      operator: FilterOperatorKey.notIn,
      value: ["u1"],
    });

    expect(
      FilterSchema.parse({
        field: FilterFieldKey.userIds,
        operator: FilterOperatorKey.hasSome,
        value: ["u2"],
      }),
    ).toEqual({
      field: FilterFieldKey.userIds,
      operator: FilterOperatorKey.in,
      value: ["u2"],
    });

    expect(
      FilterSchema.parse({
        field: FilterFieldKey.userIds,
        operator: FilterOperatorKey.hasSome,
        value: [],
      }),
    ).toEqual({
      field: FilterFieldKey.userIds,
      operator: FilterOperatorKey.in,
      value: [],
    });
  });

  it.each([FilterOperatorKey.hasNone, FilterOperatorKey.hasSome])(
    "rejects a malformed non-array value on %s instead of widening it to an existence filter",
    (operator) => {
      expect(
        FilterSchema.safeParse({
          field: FilterFieldKey.userIds,
          operator,
          value: "u1",
        }).success,
      ).toBe(false);
    },
  );
});
