import type { GetQueryParams } from "@/core/base/base-get.schema";

export function publicRecordsQuery(params?: GetQueryParams) {
  const pageSize = params?.pageSize ?? params?.pagination?.pageSize;
  return {
    page: params?.page ?? params?.pagination?.page ?? 1,
    ...(pageSize ? { pageSize } : {}),
    ...(params?.sortDescriptor ? { sortDescriptor: params.sortDescriptor } : {}),
    ...(params?.filters?.length ? { filters: params.filters } : {}),
    ...(params?.searchTerm ? { searchTerm: params.searchTerm } : {}),
  };
}
