import type { FilterableField, GetQueryParams, SortDescriptor } from "@/core/base/base-get.schema";

import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);

import { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";

import { GetCalendarEventsInteractor } from "../get-calendar-events.interactor";
import { GetCalendarsInteractor } from "../get-calendars.interactor";

function stubRepo(sortField: string) {
  return {
    itemCalls: [] as GetQueryParams[],
    getItems(params: GetQueryParams) {
      this.itemCalls.push(params);
      return Promise.resolve([]);
    },
    getCount: () => Promise.resolve(0),
    getSortableFields: () => [{ field: sortField, resolvedFields: [sortField] }],
    getSearchableFields: () => [{ field: sortField }],
    getFilterableFields: (): Promise<FilterableField[]> => Promise.resolve([]),
    getCustomColumns: () => Promise.resolve([]),
    customColumnsOnce: () => Promise.resolve([]),
    filterableFieldsOnce: (): Promise<FilterableField[]> => Promise.resolve([]),
    getGroupableFields: () => Promise.resolve([]),
    validateFilters: () => [],
    validateSortDescriptor: ({ sortDescriptor }: { sortDescriptor: SortDescriptor | undefined }) =>
      sortDescriptor?.field === sortField ? sortDescriptor : undefined,
    sumNumericFields: () => Promise.resolve({}),
  };
}

function precheck() {
  return new QueryParamsPrecheckInteractor(
    ...(Array.from({ length: 9 }) as ConstructorParameters<typeof QueryParamsPrecheckInteractor>),
  );
}

const cases = [
  {
    label: "calendars",
    sortField: "name",
    build: (repo: ReturnType<typeof stubRepo>) =>
      new GetCalendarsInteractor(repo as never, {} as never, "api", precheck(), mockEntitlementService()),
  },
  {
    label: "calendar events",
    sortField: "startsAt",
    build: (repo: ReturnType<typeof stubRepo>) =>
      new GetCalendarEventsInteractor(repo as never, {} as never, "api", precheck(), mockEntitlementService()),
  },
];

describe.each(cases)("$label search sort echo", ({ sortField, build }) => {
  async function echoedSort(params: GetQueryParams) {
    const repo = stubRepo(sortField);
    const result = await build(repo).invoke(params);
    if (!result.ok) throw new Error("the search was rejected");

    return { echoed: result.data.sortDescriptor, passed: repo.itemCalls[0]?.sortDescriptor };
  }

  it("echoes the same sort whether or not the request carries its own query state", async () => {
    const outcomes = [
      await echoedSort({}),
      await echoedSort({ pagination: { page: 1, pageSize: 5 } }),
      await echoedSort({ searchTerm: "b" }),
    ];

    expect(outcomes.map((outcome) => outcome.echoed)).toEqual([undefined, undefined, undefined]);
    expect(outcomes.map((outcome) => outcome.passed)).toEqual([undefined, undefined, undefined]);
  });

  it("echoes a sort the caller asked for", async () => {
    const requested: SortDescriptor = { field: sortField, direction: "desc" };

    expect(await echoedSort({ sortDescriptor: requested })).toEqual({ echoed: requested, passed: requested });
  });
});
