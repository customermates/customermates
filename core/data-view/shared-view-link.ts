import type { Grouping } from "@/core/base/grouping/grouping.schema";
import type { DataViewState } from "./data-view-state.schema";

import { z } from "zod";

import { ViewMode } from "@/core/base/base-query-builder";
import { sameGrouping } from "@/core/base/grouping/grouping.schema";

import { SurfaceKeySchema } from "./data-view-identity.schema";
import { DATA_VIEW_NAME_MAX_LENGTH } from "./data-view-limits";
import { DataViewStateSchema } from "./data-view-state.schema";

export const SHARED_VIEW_PARAM = "viewShare";

const SHARED_VIEW_TOKEN_MAX_LENGTH = 16000;

const SharedViewSchema = z
  .object({
    name: z.string().trim().min(1).max(DATA_VIEW_NAME_MAX_LENGTH),
    surfaceKey: SurfaceKeySchema,
    state: DataViewStateSchema,
  })
  .strict();

export type SharedView = z.infer<typeof SharedViewSchema>;

export type SharedViewScope = {
  columnIds: ReadonlySet<string>;
  filterFields?: ReadonlySet<string>;
  groupings: readonly Grouping[];
  sortableColumnIds: ReadonlySet<string>;
  supportsBoard: boolean;
};

export function encodeSharedView(view: SharedView): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(JSON.stringify(view))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export function decodeSharedView(token: string | null | undefined): SharedView | undefined {
  if (!token || token.length > SHARED_VIEW_TOKEN_MAX_LENGTH || !/^[\w-]+$/u.test(token)) return undefined;
  try {
    const binary = atob(token.replace(/-/gu, "+").replace(/_/gu, "/"));
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
    const parsed = SharedViewSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function scopeSharedViewState(state: DataViewState, scope: SharedViewScope): DataViewState {
  const columns = (ids: string[] | undefined) => (ids ?? []).filter((id) => scope.columnIds.has(id));
  const grouping =
    state.grouping && scope.groupings.some((candidate) => sameGrouping(candidate, state.grouping))
      ? state.grouping
      : null;
  const sort = state.sortDescriptor;

  return {
    filters: (state.filters ?? []).filter((filter) => !scope.filterFields || scope.filterFields.has(filter.field)),
    searchTerm: state.searchTerm ?? "",
    sortDescriptor: sort && scope.sortableColumnIds.has(sort.field) ? sort : null,
    ...(state.pageSize ? { pageSize: state.pageSize } : {}),
    viewMode: state.viewMode === ViewMode.card && scope.supportsBoard ? ViewMode.card : ViewMode.table,
    grouping,
    columnOrder: columns(state.columnOrder),
    columnWidths: Object.fromEntries(
      Object.entries(state.columnWidths ?? {}).filter(([id]) => scope.columnIds.has(id)),
    ),
    hiddenColumns: columns(state.hiddenColumns),
  };
}
