import type { Filter, SortDescriptor } from "@/core/base/base-get.schema";
import type { DataViewState } from "./data-view-state.schema";

import deepEqual from "fast-deep-equal/es6";

import { ViewMode } from "@/core/base/base-query-builder";

import { DATA_VIEW_STATE_FIELDS } from "./data-view-state.schema";

export const DEFAULT_DATA_VIEW_PAGE_SIZE = 100;

export type DataViewPageSize = 5 | 10 | 25 | 100;

const PARAM_CARRIED_FIELDS = new Set<keyof DataViewState>([
  "filters",
  "searchTerm",
  "sortDescriptor",
  "pageSize",
  "viewMode",
  "groupingColumnId",
]);

export type DataViewParamsLayer = {
  filters?: Filter[];
  searchTerm?: string;
  sortDescriptor?: SortDescriptor | null;
  pageSize?: DataViewPageSize;
  viewMode?: ViewMode;
  groupingColumnId?: string | null;
};

export type DataViewDefaultsLayer = {
  filters?: Filter[];
  searchTerm?: string;
  sortDescriptor?: SortDescriptor;
  pageSize?: DataViewPageSize;
};

export type ResolvedDataViewState = {
  filters: Filter[];
  searchTerm: string | undefined;
  sortDescriptor: SortDescriptor | undefined;
  pageSize: DataViewPageSize;
  viewMode: ViewMode;
  groupingColumnId: string | undefined;
  columnOrder: string[];
  columnWidths: Record<string, number>;
  hiddenColumns: string[];
};

export type ResolveDataViewStateArgs = {
  params?: DataViewParamsLayer;
  override?: DataViewState;
  view?: DataViewState;
  defaults?: DataViewDefaultsLayer;
};

type Layer = Record<string, unknown> | undefined;

function has(layer: Layer, key: string): boolean {
  return layer !== undefined && Object.prototype.hasOwnProperty.call(layer, key) && layer[key] !== undefined;
}

export function resolveDataViewState({
  params,
  override,
  view,
  defaults,
}: ResolveDataViewStateArgs): ResolvedDataViewState {
  const paramsLayer = params as Layer;
  const overrideLayer = override as Layer;
  const viewLayer = view as Layer;
  const defaultsLayer = defaults as Layer;

  const out: Record<string, unknown> = {};

  for (const key of DATA_VIEW_STATE_FIELDS) {
    const layers = PARAM_CARRIED_FIELDS.has(key)
      ? [paramsLayer, overrideLayer, viewLayer, defaultsLayer]
      : [overrideLayer, viewLayer, defaultsLayer];

    for (const layer of layers) {
      if (has(layer, key)) {
        out[key] = layer?.[key];
        break;
      }
    }
  }

  const searchTerm = out.searchTerm as string | undefined;

  return {
    filters: (out.filters as Filter[] | undefined) ?? [],
    searchTerm: searchTerm === "" ? undefined : searchTerm,
    sortDescriptor: (out.sortDescriptor as SortDescriptor | null | undefined) ?? defaults?.sortDescriptor,
    pageSize: (out.pageSize as DataViewPageSize | undefined) ?? defaults?.pageSize ?? DEFAULT_DATA_VIEW_PAGE_SIZE,
    viewMode: (out.viewMode as ViewMode | undefined) ?? ViewMode.table,
    groupingColumnId: (out.groupingColumnId as string | null | undefined) ?? undefined,
    columnOrder: (out.columnOrder as string[] | undefined) ?? [],
    columnWidths: (out.columnWidths as Record<string, number> | undefined) ?? {},
    hiddenColumns: (out.hiddenColumns as string[] | undefined) ?? [],
  };
}

function comparable(key: keyof DataViewState, value: unknown): unknown {
  if (key === "sortDescriptor" || key === "groupingColumnId") return value ?? null;
  if (key === "searchTerm") return value === "" ? undefined : value;
  return value;
}

export function diffDataViewState(incoming: DataViewState, base: ResolvedDataViewState): DataViewState {
  const incomingLayer = incoming as Record<string, unknown>;
  const baseLayer = base as unknown as Record<string, unknown>;
  const delta: Record<string, unknown> = {};

  for (const key of DATA_VIEW_STATE_FIELDS) {
    if (!has(incomingLayer, key)) continue;
    const next = incomingLayer[key];
    if (!deepEqual(comparable(key, next), comparable(key, baseLayer[key]))) delta[key] = next;
  }

  return delta as DataViewState;
}
