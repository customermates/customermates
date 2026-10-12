import type { FilterableField, GetQueryParams, PaginationResponse } from "@/core/base/base-get.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { QueryTrashData, TrashItemDto, TrashKind, TrashPage } from "@/features/trash/trash.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { TRASH_KINDS } from "@/features/trash/trash.schema";

export const TRASH_FILTER = Object.freeze({ kind: FilterFieldKey.trashKind, list: FilterFieldKey.trashList } as const);

export const TRASH_PAGE_SIZE = 25;

function filterValues(params: GetQueryParams, field: string) {
  const filter = params.filters?.find(
    (candidate) => candidate.field === field && candidate.operator === FilterOperatorKey.in,
  );
  return filter && "value" in filter && Array.isArray(filter.value) && filter.value.length ? filter.value : undefined;
}

const isTrashKind = (value: string): value is TrashKind => (TRASH_KINDS as readonly string[]).includes(value);

export function toTrashQuery(params: GetQueryParams = {}): QueryTrashData {
  const kinds = filterValues(params, TRASH_FILTER.kind)?.filter(isTrashKind);
  const typeIds = filterValues(params, TRASH_FILTER.list);
  const search = params.searchTerm?.trim();
  const sort = params.sortDescriptor;
  return {
    ...(sort?.field === "deletedAt" ? { sortDescriptor: { field: "deletedAt", direction: sort.direction } } : {}),
    ...(kinds?.length ? { kinds } : {}),
    ...(typeIds ? { typeIds } : {}),
    ...(search ? { search } : {}),
    page: params.pagination?.page ?? 1,
    pageSize: params.pagination?.pageSize ?? TRASH_PAGE_SIZE,
  };
}

const TRASH_FILTERABLE_FIELDS: FilterableField[] = [
  { field: TRASH_FILTER.kind, operators: [FilterOperatorKey.in] },
  { field: TRASH_FILTER.list, operators: [FilterOperatorKey.in] },
];

type TrashKindLabelKey = TrashKind | "dashboardView";

export function trashKindLabelKey(item: { kind: TrashKind; surfaceKey: string | null }): TrashKindLabelKey {
  return item.kind === "view" && item.surfaceKey === "dashboard" ? "dashboardView" : item.kind;
}

export function toTrashResult(
  params: GetQueryParams | undefined,
  query: QueryTrashData,
  page: TrashPage,
): GetResult<TrashItemDto> {
  return {
    items: page.items,
    filters: params?.filters,
    searchTerm: params?.searchTerm,
    sortDescriptor: query.sortDescriptor,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(page.total / query.pageSize)),
      total: page.total,
    } as PaginationResponse,
    filterableFields: TRASH_FILTERABLE_FIELDS,
  };
}
