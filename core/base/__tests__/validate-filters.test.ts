import type { Filter, FilterableField } from "@/core/base/base-get.schema";

import { describe, it, expect } from "vitest";

import { BaseQueryBuilder, FilterOperatorKey, defaultValidateFilters } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

class TestQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {}

const FIELDS: FilterableField[] = [{ field: FilterFieldKey.userIds, operators: [FilterOperatorKey.in] }];
const RELATION_FIELDS: FilterableField[] = [
  {
    field: FilterFieldKey.userIds,
    operators: [FilterOperatorKey.in, FilterOperatorKey.notIn, FilterOperatorKey.hasNone, FilterOperatorKey.hasSome],
  },
];

class RelationQueryBuilder extends TestQueryBuilder {
  override getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve(RELATION_FIELDS);
  }
}

const CUSTOM_COLUMN_ID = "3f1c9a72-5d84-4a1e-9f3b-6c2d8e0a7b45";
const CUSTOM_COLUMN_FIELDS: FilterableField[] = [
  { field: CUSTOM_COLUMN_ID, operators: [FilterOperatorKey.hasNone, FilterOperatorKey.hasSome] },
];

class CustomColumnQueryBuilder extends TestQueryBuilder {
  override getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve(CUSTOM_COLUMN_FIELDS);
  }
}

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

  it("keeps value-less relation existence operators", () => {
    const filters: Filter[] = [
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasNone },
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasSome },
    ];

    expect(qb.validateFilters({ filters, filterableFields: RELATION_FIELDS })).toEqual(filters);
  });

  it("normalizes legacy relation existence filters without changing their meaning", () => {
    const filters = [
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasNone, value: ["u1"] },
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasSome, value: ["u2"] },
    ] as unknown as Filter[];

    expect(qb.validateFilters({ filters, filterableFields: RELATION_FIELDS })).toEqual([
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.notIn, value: ["u1"] },
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.in, value: ["u2"] },
    ]);
  });

  it("keeps legacy empty relation values invalid", () => {
    const filters = [
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasNone, value: [] },
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasSome, value: [] },
    ] as unknown as Filter[];

    expect(qb.validateFilters({ filters, filterableFields: RELATION_FIELDS })).toEqual([]);
  });

  it("drops malformed scalar relation-existence values instead of widening them", () => {
    const filters = [
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasNone, value: "u1" },
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasSome, value: "u2" },
    ] as unknown as Filter[];

    expect(qb.validateFilters({ filters, filterableFields: RELATION_FIELDS })).toEqual([]);
  });

  it("builds relation existence queries without selected values", async () => {
    const queryBuilder = new RelationQueryBuilder();
    const filters: Filter[] = [
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasNone },
      { field: FilterFieldKey.userIds, operator: FilterOperatorKey.hasSome },
    ];

    const result = await queryBuilder.buildQueryArgs({ filters });

    expect(result.where).toEqual({
      AND: [{ users: { none: {} } }, { users: { some: {} } }],
    });
  });

  it("scopes relation existence queries on a custom column to that column", async () => {
    const queryBuilder = new CustomColumnQueryBuilder();
    const filters: Filter[] = [
      { field: CUSTOM_COLUMN_ID, operator: FilterOperatorKey.hasNone },
      { field: CUSTOM_COLUMN_ID, operator: FilterOperatorKey.hasSome },
    ];

    const result = await queryBuilder.buildQueryArgs({ filters });

    expect(result.where).toEqual({
      AND: [
        { customFieldValues: { none: { columnId: CUSTOM_COLUMN_ID } } },
        { customFieldValues: { some: { columnId: CUSTOM_COLUMN_ID } } },
      ],
    });
  });
});
