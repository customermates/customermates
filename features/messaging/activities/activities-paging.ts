import type { GetResult } from "@/core/base/base-get.interactor";
import type { PaginationRequest } from "@/core/base/base-get.schema";

import { ACTIVITY_MAX_PAGE } from "@/ee/messaging/activities/activity-scope.schema";

export type ActivitiesPageSize = PaginationRequest["pageSize"];

export const ACTIVITIES_PAGE_SIZE: ActivitiesPageSize = 25;

export type PagedActivitiesResult = Pick<GetResult<unknown>, "items" | "pagination">;

export function computeHasMore(
  result: PagedActivitiesResult,
  page: number,
  pageSize: ActivitiesPageSize = ACTIVITIES_PAGE_SIZE,
): boolean {
  if (page >= ACTIVITY_MAX_PAGE) return false;
  if (result.pagination) return page * pageSize < result.pagination.total;

  return result.items.length >= pageSize;
}
