import type { GetQueryParams } from "@/core/base/base-get.schema";

import { z } from "zod";

export const ListQueryParamsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().describe("Page number, starting at 1."),
  pageSize: z
    .union([z.literal("5"), z.literal("10"), z.literal("25"), z.literal("100")])
    .optional()
    .describe("Items per page: 5, 10, 25 or 100. Default 25."),
  searchTerm: z.string().max(200).optional().describe("Free-text search."),
  sortField: z.string().optional().describe("Field to sort by."),
  sortDirection: z.enum(["asc", "desc"]).optional().describe("Sort direction; requires sortField."),
});

function numeric(value: string | null) {
  return value === null ? undefined : Number(value);
}

export function listQueryParams(searchParams: URLSearchParams): GetQueryParams {
  const page = numeric(searchParams.get("page"));
  const pageSize = numeric(searchParams.get("pageSize"));
  const sortField = searchParams.get("sortField");

  const params = {
    searchTerm: searchParams.get("searchTerm") ?? undefined,
    ...(page === undefined && pageSize === undefined
      ? {}
      : { pagination: { page: page ?? 1, pageSize: pageSize ?? 25 } }),
    ...(sortField === null
      ? {}
      : { sortDescriptor: { field: sortField, direction: searchParams.get("sortDirection") ?? "asc" } }),
  };

  return params as GetQueryParams;
}
