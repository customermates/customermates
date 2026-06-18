import type { Filter, FilterableField } from "@/core/base/base-get.schema";

import { describe, it, expect } from "vitest";

import { BaseQueryBuilder, FilterOperatorKey, defaultValidateFilters } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

class TestQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {}

const FIELDS: FilterableField[] = [{ field: FilterFieldKey.userIds, operators: [FilterOperatorKey.in] }];

describe("BaseQueryBuilder.validateFilters delegates to defaultValidateFilters", () => {
  const qb = new TestQueryBuilder();

  it("keeps a well-formed filter on an allowed field and operator", () => {
    const filters: Filter[] = [{ field: FilterFieldKey.userIds, operator: FilterOperatorKey.in, value: ["u1"] }];

    expect(qb.validateFilters({ filters, filterableFields: FIELDS })).toEqual(filters);
  });

  it("drops an unknown field, a disallowed operator, and an empty value array", () => {
    const filters: Filter[] = [
      { field: "unknownField", operator: FilterOperatorKey.in, value: ["x"] },
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.notIn, value: ["u1"] },
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.in, value: [] },
    ];

    expect(qb.validateFilters({ filters, filterableFields: FIELDS })).toEqual([]);
  });

  it("returns exactly what the extracted function returns", () => {
    const args: { filters: Filter[]; filterableFields: FilterableField[] } = {
      filters: [
        { field: FilterFieldKey.userIds, operator: FilterOperatorKey.in, value: ["u1", "u2"] },
        { field: "unknownField", operator: FilterOperatorKey.in, value: ["x"] },
      ],
      filterableFields: FIELDS,
    };

    expect(qb.validateFilters(args)).toEqual(defaultValidateFilters(args));
  });
});
