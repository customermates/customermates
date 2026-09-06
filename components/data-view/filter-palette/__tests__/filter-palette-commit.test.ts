import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityFiltersSchema } from "@/ee/messaging/activities/activities.schema";
import { CustomColumnType, EntityType } from "@/generated/prisma";
import { defaultValidateFilters, FilterOperatorKey } from "@/core/base/base-query-builder";
import { GetQueryParamsApiSchema } from "@/core/base/base-get.schema";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";

import { FILTER_AUTO_APPLY_DELAY_MS, FilterPaletteStore, MAX_APPLIED_FILTERS } from "../filter-palette.store";

const CURRENCY_COLUMN = "11111111-1111-4111-8111-111111111111";
const A_USER = "60000000-0000-4000-8000-000000000001";
const ANOTHER_USER = "60000000-0000-4000-8000-000000000002";

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: "name", operators: [FilterOperatorKey.contains, FilterOperatorKey.equals, FilterOperatorKey.isNull] },
  {
    field: "userIds",
    operators: [FilterOperatorKey.in, FilterOperatorKey.notIn, FilterOperatorKey.hasSome, FilterOperatorKey.hasNone],
  },
  {
    field: "contactIds",
    operators: [FilterOperatorKey.in, FilterOperatorKey.notIn, FilterOperatorKey.hasSome, FilterOperatorKey.hasNone],
  },
  { field: "status", operators: [FilterOperatorKey.in, FilterOperatorKey.notIn] },
  {
    field: "createdAt",
    operators: [
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
      FilterOperatorKey.between,
      FilterOperatorKey.inLastDays,
    ],
  },
  {
    field: CURRENCY_COLUMN,
    operators: [
      FilterOperatorKey.equals,
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
      FilterOperatorKey.isNull,
      FilterOperatorKey.isNotNull,
    ],
  },
];

const CUSTOM_COLUMNS = [
  { id: CURRENCY_COLUMN, label: "Budget", entityType: EntityType.deal, type: CustomColumnType.currency },
] as unknown as CustomColumnDto[];

function tableStore(overrides: { filters?: Filter[] } = {}) {
  const table = {
    customColumns: CUSTOM_COLUMNS,
    filterableFields: FILTERABLE_FIELDS,
    filters: overrides.filters ?? [],
    p13nId: "contacts",
    setQueryOptions: vi.fn((args: { filters?: Filter[] }) => {
      if (args.filters) table.filters = args.filters;
    }),
  };

  return table;
}

type TestTable = ReturnType<typeof tableStore>;

function paletteStore() {
  const root = { registerModalStore: vi.fn(), localeStore: { getTranslation: (key: string) => key } };

  return new FilterPaletteStore(root as unknown as RootStore);
}

function openedOn(table: TestTable) {
  const store = paletteStore();
  store.openFor(table as unknown as BaseDataViewStore<HasId>);

  return store;
}

function lastCommit(table: TestTable) {
  return table.setQueryOptions.mock.calls.at(-1)?.[0];
}

function expectExecutable(table: TestTable) {
  const applied = table.filters;

  expect(applied.every(hasValidFilterConfiguration)).toBe(true);
  expect(defaultValidateFilters({ filters: applied, filterableFields: FILTERABLE_FIELDS })).toEqual(applied);
}

describe("filter palette commit timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits a run of option toggles once, in the background, after the debounce elapses", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("userIds");
    store.toggleValue(A_USER);
    store.toggleValue(ANOTHER_USER);

    expect(table.setQueryOptions).not.toHaveBeenCalled();

    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expect(lastCommit(table)).toEqual({
      filters: [{ field: "userIds", operator: FilterOperatorKey.in, value: [A_USER, ANOTHER_USER] }],
      refreshMode: "background",
    });
    expectExecutable(table);
  });

  it("does not commit an option toggle before the debounce elapses", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("userIds");
    store.toggleValue(A_USER);
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS - 1);

    expect(table.setQueryOptions).not.toHaveBeenCalled();
  });

  it("commits a discrete date preset immediately, without waiting for the debounce", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("createdAt");
    store.commitNow({ operator: FilterOperatorKey.inLastDays, value: 30 });

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expect(lastCommit(table)).toEqual({
      filters: [{ field: "createdAt", operator: FilterOperatorKey.inLastDays, value: 30 }],
      refreshMode: "background",
    });

    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expectExecutable(table);
  });

  it("applies a typed value immediately through the flush the reused inputs call", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("name");
    store.onChange("draft.value", "acme");
    store.flushPendingChanges();

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expect(lastCommit(table)).toEqual({
      filters: [{ field: "name", operator: FilterOperatorKey.contains, value: "acme" }],
      refreshMode: "background",
    });

    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
  });

  it("writes a relation-existence operator with no value key at all", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("contactIds");
    store.toggleValue(A_USER);
    store.commitNow({ operator: FilterOperatorKey.hasSome });

    const committed = table.filters[0];

    expect(committed).toEqual({ field: "contactIds", operator: FilterOperatorKey.hasSome });
    expect("value" in (committed as object)).toBe(false);
    expect(() => ActivityFiltersSchema.parse([committed])).not.toThrow();
    expectExecutable(table);
  });

  it("removes the filter when a select page is emptied to zero values", () => {
    const table = tableStore({
      filters: [{ field: "userIds", operator: FilterOperatorKey.in, value: [A_USER] } as Filter],
    });
    const store = openedOn(table);

    store.editFilterAt(0);
    store.toggleValue(A_USER);
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(lastCommit(table)).toEqual({ filters: [], refreshMode: "background" });
  });

  it("keeps editing the row it created instead of appending a second one", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("status");
    store.toggleValue("open");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);
    store.toggleValue("won");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.filters).toEqual([{ field: "status", operator: FilterOperatorKey.in, value: ["open", "won"] }]);
    expect(table.setQueryOptions).toHaveBeenCalledTimes(2);
  });

  it("appends a second filter on a field that already carries one", () => {
    const table = tableStore({
      filters: [{ field: "status", operator: FilterOperatorKey.in, value: ["open"] } as Filter],
    });
    const store = openedOn(table);

    store.pickField("status");
    store.toggleValue("won");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.filters).toEqual([
      { field: "status", operator: FilterOperatorKey.in, value: ["open"] },
      { field: "status", operator: FilterOperatorKey.in, value: ["won"] },
    ]);
    expectExecutable(table);
  });

  it("keeps editing the row it created after stepping back inside the same field", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("createdAt");
    store.pushDateInput(FilterOperatorKey.gt);
    store.onChange("draft.value", "2026-09-04");
    store.flushPendingChanges();
    store.pop();

    expect(store.page).toEqual({ kind: "value", field: "createdAt" });

    store.pushDateInput(FilterOperatorKey.gt);

    expect(store.form.draft.value).toBe("2026-09-04");

    store.onChange("draft.value", "2026-09-20");
    store.flushPendingChanges();

    expect(table.filters).toEqual([{ field: "createdAt", operator: FilterOperatorKey.gt, value: "2026-09-20" }]);
    expectExecutable(table);
  });

  it("edits the row the deep link named, leaving its sibling on the same field alone", () => {
    const table = tableStore({
      filters: [
        { field: "status", operator: FilterOperatorKey.in, value: ["open"] } as Filter,
        { field: "status", operator: FilterOperatorKey.in, value: ["won"] } as Filter,
      ],
    });
    const store = openedOn(table);

    store.editFilterAt(1);
    store.toggleValue("lost");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.filters).toEqual([
      { field: "status", operator: FilterOperatorKey.in, value: ["open"] },
      { field: "status", operator: FilterOperatorKey.in, value: ["won", "lost"] },
    ]);
  });

  it("flushes a pending edit when the page is popped", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("name");
    store.onChange("draft.value", "acme");
    store.pop();

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expect(store.page).toEqual({ kind: "root" });
  });

  it("flushes a pending edit when the overlay closes", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("name");
    store.onChange("draft.value", "acme");
    store.close();

    expect(table.setQueryOptions).toHaveBeenCalledTimes(1);
    expect(table.filters).toEqual([{ field: "name", operator: FilterOperatorKey.contains, value: "acme" }]);
  });

  it("commits nothing at all when the draft never became a usable filter", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("name");
    store.onChange("draft.value", "");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);
    store.close();

    expect(table.setQueryOptions).not.toHaveBeenCalled();
  });

  it("drops a pending edit that was explicitly cancelled", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("name");
    store.onChange("draft.value", "acme");
    store.cancelPending();
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.setQueryOptions).not.toHaveBeenCalled();
  });

  it("commits a number page as the numeric string the query builder expects", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField(CURRENCY_COLUMN);
    store.onChange("draft.value", "2500");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.filters).toEqual([{ field: CURRENCY_COLUMN, operator: FilterOperatorKey.gte, value: "2500" }]);
    expectExecutable(table);
  });

  it("never overwrites a chip that moved underneath the open page", () => {
    const table = tableStore();
    const store = openedOn(table);

    store.pickField("status");
    store.toggleValue("open");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    table.filters = [{ field: "name", operator: FilterOperatorKey.contains, value: "acme" } as Filter];
    store.toggleValue("won");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.filters).toEqual([
      { field: "name", operator: FilterOperatorKey.contains, value: "acme" },
      { field: "status", operator: FilterOperatorKey.in, value: ["open", "won"] },
    ]);
  });

  it("refuses to append past the cap the query schema enforces", () => {
    const atLimit = Array.from(
      { length: MAX_APPLIED_FILTERS },
      (_, index) => ({ field: "name", operator: FilterOperatorKey.contains, value: `term-${index}` }) as Filter,
    );
    const table = tableStore({ filters: atLimit });
    const store = openedOn(table);

    expect(store.isAtFilterLimit).toBe(true);

    store.pickField("status");

    expect(store.page).toEqual({ kind: "root" });

    store.push({ kind: "value", field: "status" });
    store.toggleValue("open");
    vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);

    expect(table.setQueryOptions).not.toHaveBeenCalled();
    expect(table.filters).toHaveLength(MAX_APPLIED_FILTERS);
  });

  it("pins the palette cap to the cap the API schema enforces", () => {
    const filters = Array.from(
      { length: MAX_APPLIED_FILTERS },
      () => ({ field: "name", operator: FilterOperatorKey.contains, value: "acme" }) as Filter,
    );

    expect(GetQueryParamsApiSchema.safeParse({ filters }).success).toBe(true);
    expect(GetQueryParamsApiSchema.safeParse({ filters: [...filters, filters[0]] }).success).toBe(false);
  });
});
