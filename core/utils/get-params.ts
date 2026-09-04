import type { Filter, GetQueryParams, SortDescriptor } from "@/core/base/base-get.schema";

import { z } from "zod";

import { FilterOperatorKey, ViewMode } from "../base/base-query-builder";
import { normalizeFilter } from "../base/filter-compat";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const VALID_PAGE_SIZES = [5, 10, 25, 100];
const GroupingColumnIdSchema = z.uuid();

export const GET_PARAM_KEYS = [
  "filters",
  "groupBy",
  "page",
  "pageSize",
  "searchTerm",
  "sort",
  "sortDir",
  "sortField",
  "view",
  "viewMode",
] as const;

export function encodeGetParams(params: GetQueryParams = {}): URLSearchParams {
  const sp = new URLSearchParams();

  if (params.searchTerm) sp.set("searchTerm", params.searchTerm);

  if (params.sortDescriptor) {
    const { field, direction } = params.sortDescriptor;
    const sortValue = `${field}:${direction}`;

    sp.set("sort", sortValue);
  }

  const page = params.pagination?.page ?? params.page;
  const pageSize = params.pagination?.pageSize ?? params.pageSize;

  if (page && page > DEFAULT_PAGE) sp.set("page", String(page));
  if (pageSize && pageSize !== DEFAULT_PAGE_SIZE) sp.set("pageSize", String(pageSize));

  if (params.viewId) sp.set("view", params.viewId);
  if (params.viewMode && params.viewMode !== ViewMode.table) sp.set("viewMode", params.viewMode);
  if (params.viewMode === ViewMode.card && params.groupingColumnId) sp.set("groupBy", params.groupingColumnId);

  if (params.filters && params.filters.length > 0) {
    for (const candidate of params.filters) {
      const f = normalizeFilter(candidate);
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
  const source: {
    get(param: string): string | null;
    getAll(param: string): string[];
  } = (() => {
    if (
      sp &&
      typeof sp === "object" &&
      "get" in (sp as Record<string, unknown>) &&
      "getAll" in (sp as Record<string, unknown>)
    ) {
      return sp as {
        get(param: string): string | null;
        getAll(param: string): string[];
      };
    }

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

  const parsedPageSize = pageSize === null ? undefined : Number(pageSize);
  const decodedViewMode = source.get("viewMode");
  const decodedGroupBy = source.get("groupBy");

  return {
    filters,
    searchTerm,
    sortDescriptor,
    page: page === null ? undefined : Math.max(1, Number(page) || 1),
    pageSize:
      parsedPageSize !== undefined && VALID_PAGE_SIZES.includes(parsedPageSize)
        ? (parsedPageSize as 5 | 10 | 25 | 100)
        : undefined,
    viewId: source.get("view") || undefined,
    viewMode: decodedViewMode === ViewMode.card || decodedViewMode === ViewMode.table ? decodedViewMode : undefined,
    groupingColumnId: GroupingColumnIdSchema.safeParse(decodedGroupBy).success
      ? (decodedGroupBy ?? undefined)
      : undefined,
  };
}

function serializeFilterValue(op: FilterOperatorKey, value: unknown): string | undefined {
  switch (op) {
    case FilterOperatorKey.in:
    case FilterOperatorKey.notIn:
    case FilterOperatorKey.between: {
      const arr = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : [];

      return arr.map((x) => String(x)).join(",");
    }
    case FilterOperatorKey.isNull:
    case FilterOperatorKey.isNotNull:
    case FilterOperatorKey.hasNone:
    case FilterOperatorKey.hasSome:
    case FilterOperatorKey.hasUnset:
    case FilterOperatorKey.allSet:
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
        value = rest ? rest.split(",") : [];
        break;
      case FilterOperatorKey.isNull:
      case FilterOperatorKey.isNotNull:
      case FilterOperatorKey.hasUnset:
      case FilterOperatorKey.allSet:
        value = undefined;
        break;
      case FilterOperatorKey.hasNone:
        if (rest) return { field, operator: FilterOperatorKey.notIn, value: rest.split(",") };
        value = undefined;
        break;
      case FilterOperatorKey.hasSome:
        if (rest) return { field, operator: FilterOperatorKey.in, value: rest.split(",") };
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
