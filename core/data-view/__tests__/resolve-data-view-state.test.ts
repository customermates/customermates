import type { Filter, SortDescriptor } from "@/core/base/base-get.schema";
import type { DataViewState } from "../data-view-state.schema";
import type { DataViewDefaultsLayer, DataViewParamsLayer } from "../resolve-data-view-state";

import { describe, expect, it } from "vitest";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";

import { resolveDataViewState } from "../resolve-data-view-state";

const paramFilter: Filter = { field: "firstName", operator: FilterOperatorKey.contains, value: "param" };
const baseFilter: Filter = { field: "firstName", operator: FilterOperatorKey.contains, value: "base" };
const defaultFilter: Filter = { field: "firstName", operator: FilterOperatorKey.contains, value: "default" };

const defaultSort: SortDescriptor = { field: "createdAt", direction: "desc" };
const baseSort: SortDescriptor = { field: "firstName", direction: "asc" };
const paramSort: SortDescriptor = { field: "lastName", direction: "asc" };

const A_GROUPING_COLUMN = "11111111-1111-4111-8111-111111111111";

const defaults: DataViewDefaultsLayer = {
  filters: [defaultFilter],
  searchTerm: "default-search",
  sortDescriptor: defaultSort,
  pageSize: 25,
};

const base: DataViewState = {
  filters: [baseFilter],
  searchTerm: "base-search",
  sortDescriptor: baseSort,
  pageSize: 100,
  viewMode: ViewMode.table,
  grouping: null,
  columnOrder: ["firstName"],
  columnWidths: { firstName: 120 },
  hiddenColumns: ["createdAt"],
};

describe("resolveDataViewState three layer precedence", () => {
  it("prefers params over the base and the base over defaults for every param carried field", () => {
    const params: DataViewParamsLayer = {
      filters: [paramFilter],
      searchTerm: "param-search",
      sortDescriptor: paramSort,
      pageSize: 10,
      viewMode: ViewMode.card,
      grouping: { field: A_GROUPING_COLUMN },
    };

    expect(resolveDataViewState({ params, base, defaults })).toEqual({
      filters: [paramFilter],
      searchTerm: "param-search",
      sortDescriptor: paramSort,
      pageSize: 10,
      viewMode: ViewMode.card,
      grouping: { field: A_GROUPING_COLUMN },
      columnOrder: ["firstName"],
      columnWidths: { firstName: 120 },
      hiddenColumns: ["createdAt"],
    });
  });

  it("resolves every field from the base when no param names it", () => {
    expect(resolveDataViewState({ params: {}, base, defaults })).toEqual({
      filters: [baseFilter],
      searchTerm: "base-search",
      sortDescriptor: baseSort,
      pageSize: 100,
      viewMode: ViewMode.table,
      grouping: undefined,
      columnOrder: ["firstName"],
      columnWidths: { firstName: 120 },
      hiddenColumns: ["createdAt"],
    });
  });

  it("decides each field on its own, so one param leaves every other field on the base", () => {
    const resolved = resolveDataViewState({ params: { pageSize: 5 }, base, defaults });

    expect(resolved).toMatchObject({ filters: [baseFilter], searchTerm: "base-search", pageSize: 5 });
  });

  it("falls through an absent base key to defaults and keeps a present base key over them", () => {
    expect(resolveDataViewState({ base: { columnWidths: { firstName: 200 } }, defaults })).toMatchObject({
      filters: [defaultFilter],
      searchTerm: "default-search",
      sortDescriptor: defaultSort,
      pageSize: 25,
      columnWidths: { firstName: 200 },
    });
  });

  it("lets an empty base filter list beat the defaults' filters", () => {
    expect(resolveDataViewState({ base: { filters: [] }, defaults }).filters).toEqual([]);
  });

  it("floors a cleared sort descriptor and an absent one on the surface default", () => {
    expect(resolveDataViewState({ base: { sortDescriptor: null }, defaults }).sortDescriptor).toEqual(defaultSort);
    expect(resolveDataViewState({ base: {}, defaults }).sortDescriptor).toEqual(defaultSort);
  });

  it("leaves the sort descriptor undefined when the surface declares no default", () => {
    expect(resolveDataViewState({ base: { sortDescriptor: null } }).sortDescriptor).toBeUndefined();
  });

  it("lets an empty search term beat the defaults and normalises it to undefined on output", () => {
    expect(resolveDataViewState({ base: { searchTerm: "" }, defaults }).searchTerm).toBeUndefined();
  });

  it("ignores the params layer for layout even when one is injected", () => {
    const params = {
      columnOrder: ["injected"],
      columnWidths: { injected: 900 },
      hiddenColumns: ["injected"],
    } as unknown as DataViewParamsLayer;

    expect(resolveDataViewState({ params, base })).toMatchObject({
      columnOrder: ["firstName"],
      columnWidths: { firstName: 120 },
      hiddenColumns: ["createdAt"],
    });
  });

  it("keeps the base filters and the default sort when only a page is requested", () => {
    const params = { page: 2 } as unknown as DataViewParamsLayer;

    const resolved = resolveDataViewState({ params, base: { filters: [baseFilter] }, defaults });

    expect(resolved.filters).toEqual([baseFilter]);
    expect(resolved.sortDescriptor).toEqual(defaultSort);
    expect(resolved.pageSize).toBe(25);
    expect(resolved).not.toHaveProperty("page");
  });

  it("resolves pageSize through params, base, defaults and then the floor of 100", () => {
    expect(resolveDataViewState({ params: { pageSize: 5 }, base: { pageSize: 10 } }).pageSize).toBe(5);
    expect(resolveDataViewState({ base: { pageSize: 10 }, defaults: { pageSize: 25 } }).pageSize).toBe(10);
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
      grouping: undefined,
      columnOrder: [],
      columnWidths: {},
      hiddenColumns: [],
    });
  });

  it("treats a cleared grouping as no grouping with no floor", () => {
    expect(
      resolveDataViewState({ params: { grouping: null }, base: { grouping: { field: A_GROUPING_COLUMN } } }).grouping,
    ).toBeUndefined();
    expect(resolveDataViewState({ base: { grouping: null } }).grouping).toBeUndefined();
  });
});
