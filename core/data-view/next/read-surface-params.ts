import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DataViewSurfaceKey } from "@/core/data-view/data-view-keys";

import { decodeGetParams } from "@/core/utils/get-params";

type SearchParams = Record<string, string | string[] | undefined>;

export async function readSurfaceParams(
  surfaceKey: DataViewSurfaceKey,
  searchParams: Promise<SearchParams> | SearchParams,
): Promise<GetQueryParams> {
  return { ...decodeGetParams(await searchParams), p13nId: surfaceKey };
}
