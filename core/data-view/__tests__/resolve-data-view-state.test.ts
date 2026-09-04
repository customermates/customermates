import type { Filter, SortDescriptor } from "@/core/base/base-get.schema";
import type { DataViewState } from "../data-view-state.schema";
import type { DataViewDefaultsLayer, DataViewParamsLayer } from "../resolve-data-view-state";

import { describe, expect, it } from "vitest";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";

import { diffDataViewState, resolveDataViewState } from "../resolve-data-view-state";

const paramFilter: Filter = { field: "firstName", operator: FilterOperatorKey.contains, value: "param" };
const overrideFilter: Filter = { field: "firstName", operator: FilterOperatorKey.contains, value: "override" };
const viewFilter: Filter = { field: "firstName", operator: FilterOperatorKey.contains, value: "view" };
const defaultFilter: Filter = { field: "firstName", operator: FilterOperatorKey.contains, value: "default" };

const defaultSort: SortDescriptor = { field: "createdAt", direction: "desc" };
const viewSort: SortDescriptor = { field: "firstName", direction: "asc" };
const paramSort: SortDescriptor = { field: "lastName", direction: "asc" };

const defaults: DataViewDefaultsLayer = {
  filters: [defaultFilter],
  searchTerm: "default-search",
  sortDescriptor: defaultSort,
  pageSize: 25,
};

describe("resolveDataViewState precedence", () => {
  it("prefers params over override, view and defaults for every param carried field", () => {
    const params: DataViewParamsLayer = {
      filters: [paramFilter],
      searchTerm: "param-search",
      sortDescriptor: paramSort,
      pageSize: 10,
      viewMode: ViewMode.card,
      groupingColumnId: "11111111-1111-4111-8111-111111111111",
    };
    const override: DataViewState = {
      filters: [overrideFilter],
      searchTerm: "override-search",
      sortDescriptor: viewSort,
      pageSize: 100,
      viewMode: ViewMode.table,
      groupingColumnId: null,
    };
    const view: DataViewState = { filters: [viewFilter], searchTerm: "view-search", pageSize: 5 };

    expect(resolveDataViewState({ params, override, view, defaults })).toEqual({
      filters: [paramFilter],
      searchTerm: "param-search",
      sortDescriptor: paramSort,
      pageSize: 10,
      viewMode: ViewMode.card,
      groupingColumnId: "11111111-1111-4111-8111-111111111111",
      columnOrder: [],
      columnWidths: {},
      hiddenColumns: [],
    });
  });

  it("prefers the override over the view and the view over defaults", () => {
    const view: DataViewState = { filters: [viewFilter], searchTerm: "view-search", sortDescriptor: viewSort };

    expect(resolveDataViewState({ override: { filters: [overrideFilter] }, view, defaults })).toMatchObject({
      filters: [overrideFilter],
      searchTerm: "view-search",
      sortDescriptor: viewSort,
      pageSize: 25,
    });
  });

  it("lets an empty override filter list beat a non empty view filter list", () => {
    const resolved = resolveDataViewState({
      override: { filters: [] },
      view: { filters: [viewFilter] },
      defaults,
    });

    expect(resolved.filters).toEqual([]);
  });

  it("falls through an absent override key to the view and then to defaults", () => {
    expect(resolveDataViewState({ override: { columnWidths: { firstName: 200 } }, view: {}, defaults })).toMatchObject({
      filters: [defaultFilter],
      searchTerm: "default-search",
      sortDescriptor: defaultSort,
      columnWidths: { firstName: 200 },
    });
  });

  it("floors a cleared sort descriptor and an absent one on the surface default", () => {
    const cleared = resolveDataViewState({
      override: { sortDescriptor: null },
      view: { sortDescriptor: viewSort },
      defaults,
    });
    const absent = resolveDataViewState({ override: {}, view: {}, defaults });

    expect(cleared.sortDescriptor).toEqual(defaultSort);
    expect(absent.sortDescriptor).toEqual(defaultSort);
  });

  it("leaves the sort descriptor undefined when the surface declares no default", () => {
    expect(resolveDataViewState({ override: { sortDescriptor: null } }).sortDescriptor).toBeUndefined();
  });

  it("lets an empty search term beat the view and normalises it to undefined on output", () => {
    const resolved = resolveDataViewState({ override: { searchTerm: "" }, view: { searchTerm: "view-search" } });

    expect(resolved.searchTerm).toBeUndefined();
  });

  it("ignores the params layer for layout even when one is injected", () => {
    const params = {
      columnOrder: ["injected"],
      columnWidths: { injected: 900 },
      hiddenColumns: ["injected"],
    } as unknown as DataViewParamsLayer;

    const resolved = resolveDataViewState({
      params,
      override: undefined,
      view: { columnOrder: ["firstName"], columnWidths: { firstName: 120 }, hiddenColumns: ["createdAt"] },
    });

    expect(resolved).toMatchObject({
      columnOrder: ["firstName"],
      columnWidths: { firstName: 120 },
      hiddenColumns: ["createdAt"],
    });
  });

  it("keeps the stored filters and the default sort when only a page is requested", () => {
    const params = { page: 2 } as unknown as DataViewParamsLayer;
    const override: DataViewState = { filters: [overrideFilter], searchTerm: "override-search" };

    const resolved = resolveDataViewState({ params, override, view: undefined, defaults });

    expect(resolved.filters).toEqual([overrideFilter]);
    expect(resolved.searchTerm).toBe("override-search");
    expect(resolved.sortDescriptor).toEqual(defaultSort);
    expect(resolved.pageSize).toBe(25);
    expect(resolved).not.toHaveProperty("page");
  });

  it("resolves pageSize through params, override, view, defaults and then the floor of 100", () => {
    expect(resolveDataViewState({ params: { pageSize: 5 }, override: { pageSize: 10 } }).pageSize).toBe(5);
    expect(resolveDataViewState({ override: { pageSize: 10 }, view: { pageSize: 25 } }).pageSize).toBe(10);
    expect(resolveDataViewState({ view: { pageSize: 25 }, defaults: { pageSize: 5 } }).pageSize).toBe(25);
    expect(resolveDataViewState({ defaults: { pageSize: 5 } }).pageSize).toBe(5);
    expect(resolveDataViewState({}).pageSize).toBe(100);
  });

  it("applies the terminal defaults for view mode, grouping and layout", () => {
    expect(resolveDataViewState({})).toEqual({
      filters: [],
      searchTerm: undefined,
      sortDescriptor: undefined,
      pageSize: 100,
      viewMode: ViewMode.table,
      groupingColumnId: undefined,
      columnOrder: [],
      columnWidths: {},
      hiddenColumns: [],
    });
  });

  it("treats a cleared grouping column as no grouping with no floor", () => {
    const resolved = resolveDataViewState({
      override: { groupingColumnId: null },
      view: { groupingColumnId: "22222222-2222-4222-8222-222222222222" },
    });

    expect(resolved.groupingColumnId).toBeUndefined();
  });
});

describe("diffDataViewState", () => {
  it("returns nothing when the incoming total state equals the resolved base", () => {
    const base = resolveDataViewState({ view: { filters: [viewFilter], sortDescriptor: viewSort } });
    const incoming: DataViewState = {
      filters: [viewFilter],
      searchTerm: "",
      sortDescriptor: viewSort,
      pageSize: 100,
      viewMode: ViewMode.table,
      groupingColumnId: null,
      columnOrder: [],
      columnWidths: {},
      hiddenColumns: [],
    };

    expect(diffDataViewState(incoming, base)).toEqual({});
  });

  it("stores exactly the fields that differ", () => {
    const base = resolveDataViewState({ view: { filters: [viewFilter], sortDescriptor: viewSort } });
    const incoming: DataViewState = {
      filters: [],
      searchTerm: "",
      sortDescriptor: viewSort,
      pageSize: 100,
      viewMode: ViewMode.table,
      groupingColumnId: null,
      columnOrder: [],
      columnWidths: { firstName: 320 },
      hiddenColumns: [],
    };

    expect(diffDataViewState(incoming, base)).toEqual({ filters: [], columnWidths: { firstName: 320 } });
  });
});
