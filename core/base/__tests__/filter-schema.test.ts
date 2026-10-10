import { describe, expect, it } from "vitest";

import { FilterSchema } from "@/core/base/base-get.schema";
import { FilterOperatorKey, isStandaloneOperator } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

describe("FilterSchema relation existence operators", () => {
  it.each([FilterOperatorKey.hasNone, FilterOperatorKey.hasSome])("parses %s without a value", (operator) => {
    const filter = { field: FilterFieldKey.draft, operator };

    expect(FilterSchema.parse(filter)).toEqual(filter);
    expect(isStandaloneOperator(operator)).toBe(true);
  });

  it.each([FilterOperatorKey.hasNone, FilterOperatorKey.hasSome])(
    "parses %s carrying the explicit undefined value every producer emits",
    (operator) => {
      const fromUrl = { field: FilterFieldKey.draft, operator, value: undefined };

      expect("value" in fromUrl).toBe(true);
      expect(FilterSchema.parse(fromUrl)).toEqual({ field: FilterFieldKey.draft, operator });
    },
  );

  it.each([
    FilterOperatorKey.isNull,
    FilterOperatorKey.isNotNull,
    FilterOperatorKey.hasUnset,
    FilterOperatorKey.allSet,
  ])("keeps accepting %s with the same explicit undefined value", (operator) => {
    expect(FilterSchema.parse({ field: FilterFieldKey.draft, operator, value: undefined })).toEqual({
      field: FilterFieldKey.draft,
      operator,
    });
  });

  it("continues to require values for relation membership operators", () => {
    expect(FilterSchema.safeParse({ field: FilterFieldKey.draft, operator: FilterOperatorKey.in }).success).toBe(false);
    expect(FilterSchema.safeParse({ field: FilterFieldKey.draft, operator: FilterOperatorKey.notIn }).success).toBe(
      false,
    );
  });

  it.each([FilterOperatorKey.hasNone, FilterOperatorKey.hasSome])(
    "rejects a malformed non-array value on %s instead of widening it to an existence filter",
    (operator) => {
      expect(
        FilterSchema.safeParse({
          field: FilterFieldKey.draft,
          operator,
          value: "u1",
        }).success,
      ).toBe(false);
    },
  );
});
