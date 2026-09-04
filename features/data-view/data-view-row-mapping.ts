import type { Filter, SortDescriptor } from "@/core/base/base-get.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { ViewMode } from "@/core/base/base-query-builder";
import type { DataViewVisibility } from "@/generated/prisma";

import { Prisma } from "@/generated/prisma";

import { DATA_VIEW_STATE_FIELDS } from "@/core/data-view/data-view-state.schema";
import { normalizeFilters } from "@/core/base/filter-compat";

type NullableJson = Prisma.InputJsonValue | typeof Prisma.DbNull;

const CLEARED_SORT_DESCRIPTOR = {};
const CLEARED_GROUPING_COLUMN_ID = "";

export type DataViewStateColumns = {
  filters: NullableJson;
  searchTerm: string | null;
  sortDescriptor: NullableJson;
  viewMode: string | null;
  groupingColumnId: string | null;
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
  columnOrder: unknown;
  columnWidths: unknown;
  hiddenColumns: unknown;
  pageSize: number | null;
};

export type StoredViewRow = StoredStateRow & {
  id: string;
  userId: string;
  surfaceKey: string;
  name: string;
  visibility: DataViewVisibility;
  position: number;
  user?: { firstName: string | null; lastName: string | null } | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClearedSortDescriptor(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

export function readStoredState(row: StoredStateRow): DataViewState {
  const state: DataViewState = {};

  if (Array.isArray(row.filters)) state.filters = normalizeFilters(row.filters as unknown as Filter[]);
  if (row.searchTerm !== null) state.searchTerm = row.searchTerm;
  if (row.sortDescriptor !== null)
    state.sortDescriptor = isClearedSortDescriptor(row.sortDescriptor) ? null : (row.sortDescriptor as SortDescriptor);
  if (row.pageSize !== null) state.pageSize = row.pageSize as DataViewState["pageSize"];
  if (row.viewMode !== null) state.viewMode = row.viewMode as ViewMode;
  if (row.groupingColumnId !== null)
    state.groupingColumnId = row.groupingColumnId === CLEARED_GROUPING_COLUMN_ID ? null : row.groupingColumnId;
  if (Array.isArray(row.columnOrder)) state.columnOrder = row.columnOrder as string[];
  if (isPlainObject(row.columnWidths)) state.columnWidths = row.columnWidths as Record<string, number>;
  if (Array.isArray(row.hiddenColumns)) state.hiddenColumns = row.hiddenColumns as string[];

  return state;
}

export function writeStoredState(state: DataViewState): DataViewStateColumns {
  const json = (value: unknown): NullableJson =>
    value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);

  return {
    filters: json(state.filters),
    searchTerm: state.searchTerm === undefined ? null : state.searchTerm,
    sortDescriptor: json(state.sortDescriptor === null ? CLEARED_SORT_DESCRIPTOR : state.sortDescriptor),
    viewMode: state.viewMode === undefined ? null : state.viewMode,
    groupingColumnId:
      state.groupingColumnId === undefined ? null : (state.groupingColumnId ?? CLEARED_GROUPING_COLUMN_ID),
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

  return columns as Partial<DataViewStateColumns>;
}
