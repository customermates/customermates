import type { FilterableField, GetQueryParams } from "@/core/base/base-get.schema";
import type { QueryTrashData, TrashKind } from "@/features/trash/trash.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { TRASH_KINDS } from "@/features/trash/trash.schema";

export const TRASH_FILTER = Object.freeze({ kind: FilterFieldKey.kind, list: FilterFieldKey.list } as const);

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
  return {
    ...(kinds?.length ? { kinds } : {}),
    ...(typeIds ? { typeIds } : {}),
    ...(search ? { search } : {}),
    page: params.pagination?.page ?? 1,
    pageSize: params.pagination?.pageSize ?? TRASH_PAGE_SIZE,
  };
}

export function trashFilterableFields({
  kindLabel,
  lists,
}: {
  kindLabel: (kind: TrashKind) => string;
  lists: Array<{ id: string; label: string }>;
}): FilterableField[] {
  return [
    {
      field: TRASH_FILTER.kind,
      operators: [FilterOperatorKey.in],
      options: TRASH_KINDS.map((kind) => ({ value: kind, label: kindLabel(kind) })),
    },
    {
      field: TRASH_FILTER.list,
      operators: [FilterOperatorKey.in],
      options: lists.map((list) => ({ value: list.id, label: list.label })),
    },
  ];
}

export type TrashKindLabelKey = TrashKind | "dashboardView";

export function trashKindLabelKey(item: { kind: TrashKind; surfaceKey: string | null }): TrashKindLabelKey {
  return item.kind === "view" && item.surfaceKey === "dashboard" ? "dashboardView" : item.kind;
}
