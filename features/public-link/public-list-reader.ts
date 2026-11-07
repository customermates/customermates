import type { GetQueryParams, SortDescriptor } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";

import { ViewMode } from "@/core/base/base-query-builder";
import type { DATA_VIEW_PAGE_SIZES } from "@/core/data-view/data-view-state.schema";

import { publicRecordPresentation, publicSortable } from "./public-record-presentation";

type DataViewPageSize = (typeof DATA_VIEW_PAGE_SIZES)[number];

export type RecordPresentationReader = {
  invoke(input: { typeId: string; params: GetQueryParams }): Validated<RecordPresentationResult>;
};

export type PublicRecordsPage = { page: number; pageSize?: number; sortDescriptor?: SortDescriptor };

export async function readPublicRecords(
  presentation: RecordPresentationReader,
  typeId: string,
  params: GetQueryParams,
  request: PublicRecordsPage,
  expectedViewKey: string,
): Promise<RecordPresentationResult | null> {
  const load = async (sortDescriptor: SortDescriptor | undefined) => {
    const result = await presentation.invoke({
      typeId,
      params: {
        ...params,
        viewMode: ViewMode.table,
        grouping: null,
        page: request.page,
        ...(request.pageSize ? { pageSize: request.pageSize as DataViewPageSize } : {}),
        ...(sortDescriptor ? { sortDescriptor } : {}),
      },
    });
    return result.ok && result.data.result.activeViewKey === expectedViewKey ? result.data : null;
  };
  const first = await load(request.sortDescriptor);
  if (!first) return null;
  if (publicSortable(first, request.sortDescriptor)) return publicRecordPresentation(first);
  const unsorted = await load(undefined);
  return unsorted ? publicRecordPresentation(unsorted) : null;
}

export function publicListPage(
  presentation: RecordPresentationReader,
  typeId: string,
  viewId: string,
  request: PublicRecordsPage,
) {
  return readPublicRecords(presentation, typeId, { viewId }, request, viewId);
}
