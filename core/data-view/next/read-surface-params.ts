import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DataViewSurfaceKey } from "@/core/data-view/data-view-keys";

import { decodeGetParams } from "@/core/utils/get-params";

type SearchParams = Record<string, string | string[] | undefined>;

export async function readSurfaceParams(
  surfaceKey: DataViewSurfaceKey,
  searchParams: Promise<SearchParams> | SearchParams,
): Promise<GetQueryParams> {
  const resolved = await searchParams;
  if (resolved.viewSurface !== undefined && resolved.viewSurface !== surfaceKey) return { p13nId: surfaceKey };
  return { ...decodeGetParams(resolved), p13nId: surfaceKey };
}
