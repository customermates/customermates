import type { QueryParamsPrecheckInteractor } from "../query-params-precheck.interactor";
import type { Filter, FilterableField } from "../base-get.schema";

import { describe, expect, it, vi } from "vitest";

import { EntityType } from "@/features/records/history/v1/legacy-enums";
import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { Repo } from "./fixtures/single-value-equals-repo";
import { SingleValueEqualsInteractor } from "./fixtures/single-value-equals-interactor";

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

describe("BaseGetInteractor in api mode", () => {
  it("prechecks and applies the rewritten filter, so a single-select equals is accepted", async () => {
    const prechecked: unknown[] = [];
    const precheck = {
      invoke: (_fields: unknown, _entity: unknown, data: { filters?: Filter[] }) => {
        prechecked.push(...(data.filters ?? []));
      },
    } as unknown as QueryParamsPrecheckInteractor;
    const repo = new Repo();
    const interactor = new SingleValueEqualsInteractor(
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
