import type { Filter, GetQueryParams, PaginationRequest, SortDescriptor } from "@/core/base/base-get.schema";

import { FilterOperatorKey } from "../base/base-query-builder";

export function encodeGetParams(params: GetQueryParams = {}): URLSearchParams {
  const sp = new URLSearchParams();

  if (params.searchTerm) sp.set("searchTerm", params.searchTerm);

  if (params.sortDescriptor) {
    const { field, direction } = params.sortDescriptor;
    const sortValue = `${field}:${direction}`;

    sp.set("sort", sortValue);
  }

  if (params.pagination) {
    const defaultPageSize = 25;
    const defaultPage = 1;

    if (params.pagination.page && params.pagination.page > defaultPage) sp.set("page", String(params.pagination.page));
    if (params.pagination.pageSize && params.pagination.pageSize !== defaultPageSize)
      sp.set("pageSize", String(params.pagination.pageSize));
  }

  if (params.filters && params.filters.length > 0) {
    for (const f of params.filters) {
      const valuePart = serializeFilterValue(f.operator, "value" in f ? f.value : undefined);
      const token =
        valuePart !== undefined && valuePart !== null && valuePart !== ""
          ? `${f.field}:${f.operator}:${valuePart}`
          : `${f.field}:${f.operator}`;

      sp.append("filters", token);
    }
  }

  return sp;
}

export function decodeGetParams(
  sp:
    | URLSearchParams
    | { get(param: string): string | null; getAll(param: string): string[] }
    | Record<string, string | string[] | undefined>,
): GetQueryParams {
  const source: { get(param: string): string | null; getAll(param: string): string[] } = (() => {
    if (
      sp &&
      typeof sp === "object" &&
      "get" in (sp as Record<string, unknown>) &&
      "getAll" in (sp as Record<string, unknown>)
    )
      return sp as { get(param: string): string | null; getAll(param: string): string[] };

    const usp = new URLSearchParams();
    const obj = (sp as Record<string, string | string[] | undefined>) || {};

    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        for (const v of value) if (typeof v === "string") usp.append(key, v);
      } else if (typeof value === "string") usp.set(key, value);
    }

    return usp;
  })();

  const filtersParam = source.get("filters");
  const searchTerm = source.get("searchTerm") || undefined;

  let sortDescriptor: SortDescriptor | undefined = undefined;
  const combinedSort = source.get("sort");

  if (combinedSort) {
    const [field, direction] = combinedSort.split(":");

    if (field && (direction === "asc" || direction === "desc")) {
      sortDescriptor = {
        field,
        direction,
      };
    }
  }

  if (!sortDescriptor) {
    const sortField = source.get("sortField") || undefined;
    const sortDir = source.get("sortDir") as SortDescriptor["direction"] | null;

    if (sortField && sortDir) sortDescriptor = { field: sortField, direction: sortDir };
  }

  const page = source.get("page");
  const pageSize = source.get("pageSize");

  let filters: Filter[] | undefined = undefined;

  const tokens = source.getAll("filters");

  if (tokens.length > 0) filters = tokens.map(decodeFilterToken).filter(Boolean) as Filter[];
  else if (filtersParam) {
    try {
      const raw = JSON.parse(filtersParam) as Array<{
        f: string;
        o: FilterOperatorKey;
        v: unknown;
        c?: string;
      }>;

      filters = raw.map((r) => ({ field: r.f, operator: r.o, value: r.v })) as Filter[] | undefined;
    } catch {}
  }

  const validPageSizes = [5, 10, 25, 100];
  const parsedPageSize = pageSize ? Number(pageSize) : 100;
  const validPageSize = validPageSizes.includes(parsedPageSize)
    ? (parsedPageSize as PaginationRequest["pageSize"])
    : 100;

  const pagination: PaginationRequest | undefined =
    page || pageSize ? { page: Number(page || 1), pageSize: validPageSize } : undefined;

  return { filters, searchTerm, sortDescriptor, pagination };
}

function serializeFilterValue(op: FilterOperatorKey, value: unknown): string | undefined {
  switch (op) {
    case FilterOperatorKey.in:
    case FilterOperatorKey.notIn:
    case FilterOperatorKey.between:
    case FilterOperatorKey.hasNone:
    case FilterOperatorKey.hasSome: {
      const arr = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : [];

      return arr.map((x) => String(x)).join(",");
    }
    case FilterOperatorKey.isNull:
    case FilterOperatorKey.isNotNull:
      return undefined;
    case FilterOperatorKey.inLastDays:
      return value === undefined || value === null ? undefined : String(value);
    default:
      return value === undefined || value === null ? undefined : String(value);
  }
}

function decodeFilterToken(token: string): Filter | undefined {
  try {
    const parts = token.split(":");
    const field = parts[0];
    const opCode = parts[1];
    const rest = parts.slice(2).join(":");
    const validOperators = Object.values(FilterOperatorKey) as string[];
    const operator = validOperators.includes(opCode) ? (opCode as FilterOperatorKey) : undefined;

    if (!field || !operator) return undefined;

    let value: unknown = undefined;

    switch (operator) {
      case FilterOperatorKey.in:
      case FilterOperatorKey.notIn:
      case FilterOperatorKey.between:
      case FilterOperatorKey.hasNone:
      case FilterOperatorKey.hasSome:
        value = rest ? rest.split(",") : [];
        break;
      case FilterOperatorKey.isNull:
      case FilterOperatorKey.isNotNull:
        value = undefined;
        break;
      case FilterOperatorKey.inLastDays:
        value = rest ? Number(rest) : undefined;
        break;
      default:
        value = rest || undefined;
    }

    return { field, operator, value } as Filter;
  } catch {
    return undefined;
  }
}
