import type { Filter, GetQueryParams } from "@/core/base/base-get.schema";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { ViewMode } from "@/core/base/base-query-builder";
import { encodeGetParams } from "@/core/utils/get-params";

const MAX_LIST_HREF_LENGTH = 8_000;

export function recordListHref(
  typeId: string,
  filters: Filter[],
  extra: Pick<GetQueryParams, "searchTerm" | "sortDescriptor"> = {},
): string | null {
  const params = encodeGetParams({ ...extra, filters, viewMode: ViewMode.table, viewId: ALL_VIEW_KEY, page: 1 });
  params.set("viewMode", ViewMode.table);
  const href = `/records/${typeId}?${params}`;
  return href.length <= MAX_LIST_HREF_LENGTH ? href : null;
}
