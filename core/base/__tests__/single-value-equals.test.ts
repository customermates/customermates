import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { QueryParamsPrecheckInteractor } from "../query-params-precheck.interactor";
import type { Filter, FilterableField, SortDescriptor } from "../base-get.schema";

import { describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";
import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { BaseGetInteractor, BaseGetRepo } from "../base-get.interactor";
import { acceptSingleValueEquals } from "../filter-compat";

const SELECT_COLUMN = "11111111-1111-4111-8111-111111111111";
const OPTION = "22222222-2222-4222-8222-222222222222";
const FIELDS: FilterableField[] = [
  { field: SELECT_COLUMN, operators: ["in", "notIn", "isNull", "isNotNull"] as FilterableField["operators"] },
  { field: "name", operators: ["equals", "startsWith", "contains"] as FilterableField["operators"] },
];

describe("single-value equals on a select field", () => {
  it("becomes in with that one value where the field takes in but not equals", () => {
    expect(
      acceptSingleValueEquals([{ field: SELECT_COLUMN, operator: "equals", value: OPTION } as Filter], FIELDS),
    ).toEqual([{ field: SELECT_COLUMN, operator: "in", value: [OPTION] }]);
  });

  it("leaves equals on a field that takes it, an unknown field, and every other operator untouched", () => {
    const filters = [
      { field: "name", operator: "equals", value: "Acme" },
      { field: "not-a-field", operator: "equals", value: "x" },
      { field: SELECT_COLUMN, operator: "notIn", value: [OPTION] },
    ] as Filter[];
    expect(acceptSingleValueEquals(filters, FIELDS)).toEqual(filters);
    expect(acceptSingleValueEquals(undefined, FIELDS)).toBeUndefined();
  });
});

class Repo extends BaseGetRepo<{ id: string }> {
  validated: Filter[] | undefined;
  getItems() {
    return Promise.resolve([]);
  }
  getCount() {
    return Promise.resolve(0);
  }
  getSortableFields() {
    return [];
  }
  getSearchableFields() {
    return [];
  }
  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve(FIELDS);
  }
  getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve([]);
  }
  validateFilters({ filters }: { filters: Filter[] | undefined }): Filter[] {
    this.validated = filters;
    return filters ?? [];
  }
  validateSortDescriptor(): SortDescriptor | undefined {
    return undefined;
  }
  sumNumericFields() {
    return Promise.resolve({});
  }
}

describe("BaseGetInteractor in api mode", () => {
  it("prechecks and applies the rewritten filter, so a single-select equals is accepted", async () => {
    const prechecked: unknown[] = [];
    const precheck = {
      invoke: (_fields: unknown, _entity: unknown, data: { filters?: Filter[] }) => {
        prechecked.push(...(data.filters ?? []));
      },
    } as unknown as QueryParamsPrecheckInteractor;
    const repo = new Repo();
    const interactor = new (class extends BaseGetInteractor<{ id: string }> {})(
      repo,
      { loadSurfaceState: vi.fn() },
      "api",
      EntityType.task,
      undefined,
      precheck,
    );

    const result = await interactor.invoke({
      filters: [{ field: SELECT_COLUMN, operator: "equals", value: OPTION } as Filter],
    });

    expect(result.ok).toBe(true);
    expect(prechecked).toEqual([{ field: SELECT_COLUMN, operator: "in", value: [OPTION] }]);
    expect(repo.validated).toEqual([{ field: SELECT_COLUMN, operator: "in", value: [OPTION] }]);
  });
});
