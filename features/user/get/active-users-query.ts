import type { GetQueryParams } from "@/core/base/base-get.schema";

import { Status } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

export function activeUsersQuery(params: GetQueryParams = {}): GetQueryParams {
  return {
    ...params,
    filters: [
      { field: FilterFieldKey.status, operator: FilterOperatorKey.in, value: [Status.active] },
      ...(params.filters ?? []),
    ],
    sortDescriptor: params.sortDescriptor ?? { field: "name", direction: "asc" },
  };
}
