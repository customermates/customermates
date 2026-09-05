import type { Filter, SortDescriptor } from "@/core/base/base-get.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { Grouping } from "@/core/base/grouping/grouping.schema";
import type { ViewMode } from "@/core/base/base-query-builder";

import { Prisma } from "@/generated/prisma";

import { DATA_VIEW_PAGE_SIZES, DATA_VIEW_STATE_FIELDS } from "@/core/data-view/data-view-state.schema";
import { CLEARED_GROUPING, groupingShadowColumnId, readStoredGrouping } from "@/core/base/grouping/stored-grouping";
import { normalizeFilters } from "@/core/base/filter-compat";

type NullableJson = Prisma.InputJsonValue | typeof Prisma.DbNull;

const CLEARED_SORT_DESCRIPTOR = {};

export type DataViewStateColumns = {
  filters: NullableJson;
  searchTerm: string | null;
  sortDescriptor: NullableJson;
  viewMode: string | null;
  groupingColumnId: string | null;
  grouping: NullableJson;
  columnOrder: NullableJson;
  columnWidths: NullableJson;
  hiddenColumns: NullableJson;
  pageSize: number | null;
};

export type StoredStateRow = {
  filters: unknown;
  searchTerm: string | null;
  sortDescriptor: unknown;
  viewMode: string | null;
  groupingColumnId: string | null;
  grouping: unknown;
  columnOrder: unknown;
  columnWidths: unknown;
  hiddenColumns: unknown;
  pageSize: number | null;
};

export type StoredViewRow = StoredStateRow & {
  id: string;
  surfaceKey: string;
  name: string;
  position: number;
};

export type StoredPersonalizationRow = Omit<StoredStateRow, "pageSize"> & {
  pagination: unknown;
};

export type PersonalizationStateWrite = {
  filters?: Filter[];
  searchTerm?: string;
  sortDescriptor?: SortDescriptor | null;
  pagination?: { pageSize: NonNullable<DataViewState["pageSize"]> };
  viewMode?: ViewMode;
  grouping?: Grouping | null;
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  hiddenColumns?: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClearedSortDescriptor(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

function storedPageSize(pagination: unknown): number | null {
  if (!isPlainObject(pagination)) return null;
  const pageSize = pagination.pageSize;

  return typeof pageSize === "number" && (DATA_VIEW_PAGE_SIZES as readonly number[]).includes(pageSize)
    ? pageSize
    : null;
}

export function readStoredState(row: StoredStateRow): DataViewState {
  const state: DataViewState = {};

  if (Array.isArray(row.filters)) state.filters = normalizeFilters(row.filters as unknown as Filter[]);
  if (row.searchTerm !== null) state.searchTerm = row.searchTerm;
  if (row.sortDescriptor !== null)
    state.sortDescriptor = isClearedSortDescriptor(row.sortDescriptor) ? null : (row.sortDescriptor as SortDescriptor);
  if (row.pageSize !== null) state.pageSize = row.pageSize as DataViewState["pageSize"];
  if (row.viewMode !== null) state.viewMode = row.viewMode as ViewMode;
  const grouping = readStoredGrouping(row.grouping, row.groupingColumnId, row.viewMode);
  if (grouping !== undefined) state.grouping = grouping;
  if (Array.isArray(row.columnOrder)) state.columnOrder = row.columnOrder as string[];
  if (isPlainObject(row.columnWidths)) state.columnWidths = row.columnWidths as Record<string, number>;
  if (Array.isArray(row.hiddenColumns)) state.hiddenColumns = row.hiddenColumns as string[];

  return state;
}

export function readStoredPersonalizationState({ pagination, ...columns }: StoredPersonalizationRow): DataViewState {
  return readStoredState({ ...columns, pageSize: storedPageSize(pagination) });
}

export function writeStoredState(state: DataViewState): DataViewStateColumns {
  const json = (value: unknown): NullableJson =>
    value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);

  return {
    filters: json(state.filters),
    searchTerm: state.searchTerm === undefined ? null : state.searchTerm,
    sortDescriptor: json(state.sortDescriptor === null ? CLEARED_SORT_DESCRIPTOR : state.sortDescriptor),
    viewMode: state.viewMode === undefined ? null : state.viewMode,
    groupingColumnId: state.grouping === undefined ? null : groupingShadowColumnId(state.grouping),
    grouping: json(state.grouping === null ? CLEARED_GROUPING : state.grouping),
    columnOrder: json(state.columnOrder),
    columnWidths: json(state.columnWidths),
    hiddenColumns: json(state.hiddenColumns),
    pageSize: state.pageSize === undefined ? null : state.pageSize,
  };
}

export function writePartialStoredState(state: DataViewState): Partial<DataViewStateColumns> {
  const written = writeStoredState(state) as Record<string, unknown>;
  const declared = state as Record<string, unknown>;
  const columns: Record<string, unknown> = {};

  for (const field of DATA_VIEW_STATE_FIELDS)
    if (Object.prototype.hasOwnProperty.call(declared, field)) columns[field] = written[field];

  if (Object.prototype.hasOwnProperty.call(declared, "grouping")) columns.groupingColumnId = written.groupingColumnId;

  return columns as Partial<DataViewStateColumns>;
}

export function writePersonalizationState(state: DataViewState): PersonalizationStateWrite {
  const write: PersonalizationStateWrite = {};

  if (state.filters !== undefined) write.filters = state.filters;
  if (state.searchTerm !== undefined) write.searchTerm = state.searchTerm;
  if (state.sortDescriptor !== undefined) write.sortDescriptor = state.sortDescriptor;
  if (state.pageSize !== undefined) write.pagination = { pageSize: state.pageSize };
  if (state.viewMode !== undefined) write.viewMode = state.viewMode;
  if (state.grouping !== undefined) write.grouping = state.grouping;
  if (state.columnOrder !== undefined) write.columnOrder = state.columnOrder;
  if (state.columnWidths !== undefined) write.columnWidths = state.columnWidths;
  if (state.hiddenColumns !== undefined) write.hiddenColumns = state.hiddenColumns;

  return write;
}
