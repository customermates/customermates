import type { Filter, FilterableField } from "@/core/base/base-get.schema";

import { describe, it, expect } from "vitest";

import { FilterOperatorKey, defaultValidateFilters } from "@/core/base/base-query-builder";
import { QueryRepository } from "@/core/base/query-repository";
import { FilterFieldKey } from "@/core/types/filter-field-key";

class TestQueryBuilder extends QueryRepository<Record<string, unknown>> {}

const FIELDS: FilterableField[] = [{ field: FilterFieldKey.draft, operators: [FilterOperatorKey.in] }];
const RELATION_FIELDS: FilterableField[] = [
  {
    field: FilterFieldKey.draft,
    operators: [FilterOperatorKey.in, FilterOperatorKey.notIn, FilterOperatorKey.hasNone, FilterOperatorKey.hasSome],
  },
];

describe("QueryRepository.validateFilters delegates to defaultValidateFilters", () => {
  const qb = new TestQueryBuilder();

  it("keeps a well-formed filter on an allowed field and operator", () => {
    const filters: Filter[] = [{ field: FilterFieldKey.draft, operator: FilterOperatorKey.in, value: ["u1"] }];

    expect(qb.validateFilters({ filters, filterableFields: FIELDS })).toEqual(filters);
  });

  it("drops an unknown field, a disallowed operator, and an empty value array", () => {
    const filters: Filter[] = [
      { field: "unknownField", operator: FilterOperatorKey.in, value: ["x"] },
      { field: FilterFieldKey.draft, operator: FilterOperatorKey.notIn, value: ["u1"] },
      { field: FilterFieldKey.draft, operator: FilterOperatorKey.in, value: [] },
    ];

    expect(qb.validateFilters({ filters, filterableFields: FIELDS })).toEqual([]);
  });

  it("returns exactly what the extracted function returns", () => {
    const args: { filters: Filter[]; filterableFields: FilterableField[] } = {
      filters: [
        { field: FilterFieldKey.draft, operator: FilterOperatorKey.in, value: ["u1", "u2"] },
        { field: "unknownField", operator: FilterOperatorKey.in, value: ["x"] },
      ],
      filterableFields: FIELDS,
    };

    expect(qb.validateFilters(args)).toEqual(defaultValidateFilters(args));
  });

  it("keeps value-less relation existence operators", () => {
    const filters: Filter[] = [
      { field: FilterFieldKey.draft, operator: FilterOperatorKey.hasNone },
      { field: FilterFieldKey.draft, operator: FilterOperatorKey.hasSome },
    ];

    expect(qb.validateFilters({ filters, filterableFields: RELATION_FIELDS })).toEqual(filters);
  });

  it("rejects empty values on value-less existence operators", () => {
    const filters = [
      { field: FilterFieldKey.draft, operator: FilterOperatorKey.hasNone, value: [] },
      { field: FilterFieldKey.draft, operator: FilterOperatorKey.hasSome, value: [] },
    ] as unknown as Filter[];

    expect(qb.validateFilters({ filters, filterableFields: RELATION_FIELDS })).toEqual([]);
  });

  it("drops malformed scalar relation-existence values instead of widening them", () => {
    const filters = [
      { field: FilterFieldKey.draft, operator: FilterOperatorKey.hasNone, value: "u1" },
      { field: FilterFieldKey.draft, operator: FilterOperatorKey.hasSome, value: "u2" },
    ] as unknown as Filter[];

    expect(qb.validateFilters({ filters, filterableFields: RELATION_FIELDS })).toEqual([]);
  });
});
