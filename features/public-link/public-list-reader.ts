import type { Filter, GetQueryParams, SortDescriptor } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";

import { ViewMode } from "@/core/base/base-query-builder";
import type { DATA_VIEW_PAGE_SIZES } from "@/core/data-view/data-view-state.schema";

import {
  publicFilterAllowed,
  publicRecordPresentation,
  publicScope,
  publicSortable,
} from "./public-record-presentation";

type DataViewPageSize = (typeof DATA_VIEW_PAGE_SIZES)[number];

export type RecordPresentationReader = {
  invoke(input: {
    typeId: string;
    params: GetQueryParams;
    searchFields?: string[];
  }): Validated<RecordPresentationResult>;
};

export type PublicRecordsPage = {
  page: number;
  pageSize?: number;
  sortDescriptor?: SortDescriptor;
  filters?: Filter[];
  searchTerm?: string;
};

export type PublicRecords = { presentation: RecordPresentationResult; searchable: boolean };

type Narrowing = { filters?: Filter[]; searchTerm?: string; searchFields?: string[]; sortDescriptor?: SortDescriptor };

export async function readPublicRecords(
  presentation: RecordPresentationReader,
  typeId: string,
  params: GetQueryParams,
  request: PublicRecordsPage,
  expectedViewKey: string,
): Promise<PublicRecords | null> {
  const load = async ({ filters, searchTerm, searchFields, sortDescriptor }: Narrowing) => {
    const result = await presentation.invoke({
      typeId,
      params: {
        ...params,
        ...(filters ? { filters } : {}),
        ...(searchTerm !== undefined ? { searchTerm } : {}),
        viewMode: ViewMode.table,
        grouping: null,
        page: request.page,
        ...(request.pageSize ? { pageSize: request.pageSize as DataViewPageSize } : {}),
        ...(sortDescriptor ? { sortDescriptor } : {}),
      },
      ...(searchFields ? { searchFields } : {}),
    });
    return result.ok && result.data.result.activeViewKey === expectedViewKey ? result.data : null;
  };
  const base = await load({});
  if (!base) return null;
  const scope = publicScope(base);
  const savedSearch = base.result.searchTerm?.trim() ?? "";
  const visitorFilters = request.filters ?? [];
  const visitorSearch = savedSearch ? "" : (request.searchTerm?.trim() ?? "");
  if (!visitorFilters.every((filter) => publicFilterAllowed(filter, scope.filterable))) return null;
  const sortDescriptor = publicSortable(base, request.sortDescriptor) ? request.sortDescriptor : undefined;
  const searchable = !savedSearch && scope.searchFieldIds.length > 0;
  if (!visitorFilters.length && !visitorSearch && !sortDescriptor)
    return { presentation: publicRecordPresentation(base), searchable };
  const narrowed = await load({
    filters: [...(base.result.filters ?? []), ...visitorFilters],
    searchTerm: visitorSearch || savedSearch,
    searchFields: visitorSearch ? scope.searchFieldIds : undefined,
    sortDescriptor,
  });
  if (!narrowed) return null;
  return {
    presentation: publicRecordPresentation(narrowed, { filters: visitorFilters, searchTerm: visitorSearch }),
    searchable,
  };
}

export function publicListPage(
  presentation: RecordPresentationReader,
  typeId: string,
  viewId: string,
  request: PublicRecordsPage,
) {
  return readPublicRecords(presentation, typeId, { viewId }, request, viewId);
}
