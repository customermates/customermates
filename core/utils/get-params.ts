import type { Filter, GetQueryParams, SortDescriptor } from "@/core/base/base-get.schema";
import { FilterSchema } from "@/core/base/base-get.schema";

import { FilterOperatorKey, ViewMode } from "../base/base-query-builder";
import { decodeGroupingToken, encodeGroupingToken } from "../base/grouping/grouping.schema";
import { normalizeFilterInput } from "../base/filter-value";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const VALID_PAGE_SIZES = [5, 10, 25, 100];
const JSON_LIST_PREFIX = "json:";

export const GET_PARAM_KEYS = [
  "filters",
  "groupBy",
  "page",
  "pageSize",
  "searchTerm",
  "sort",
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
  if (params.grouping) sp.set("groupBy", encodeGroupingToken(params.grouping));

  if (params.filters && params.filters.length > 0) {
    for (const candidate of params.filters) {
      const f = normalizeFilterInput(candidate) as Filter;
      if (
        f.field.includes(":") ||
        ("value" in f && Array.isArray(f.value) && f.value.some((value) => value.includes(",")))
      ) {
        sp.append("filters", `v2.${JSON.stringify(f)}`);
        continue;
      }
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

  const searchTerm = source.get("searchTerm") || undefined;

  let sortDescriptor: SortDescriptor | undefined = undefined;
  const combinedSort = source.get("sort");

  if (combinedSort) {
    const separator = combinedSort.lastIndexOf(":");
    const field = combinedSort.slice(0, separator);
    const direction = combinedSort.slice(separator + 1);

    if (field && (direction === "asc" || direction === "desc")) {
      sortDescriptor = {
        field,
        direction,
      };
    }
  }

  const page = source.get("page");
  const pageSize = source.get("pageSize");

  let filters: Filter[] | undefined = undefined;

  const tokens = source.getAll("filters");

  if (tokens.length > 0) filters = tokens.map(decodeFilterToken).filter(Boolean) as Filter[];

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
    grouping: decodeGroupingToken(decodedGroupBy),
  };
}

function serializeFilterValue(op: FilterOperatorKey, value: unknown): string | undefined {
  switch (op) {
    case FilterOperatorKey.in:
    case FilterOperatorKey.notIn:
    case FilterOperatorKey.between: {
      const arr = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : [];

      const values = arr.map((x) => String(x));
      return values.some((entry) => entry.includes(",") || entry.startsWith(JSON_LIST_PREFIX))
        ? `${JSON_LIST_PREFIX}${JSON.stringify(values)}`
        : values.join(",");
    }
    case FilterOperatorKey.isNull:
    case FilterOperatorKey.isNotNull:
    case FilterOperatorKey.hasNone:
    case FilterOperatorKey.hasSome:
    case FilterOperatorKey.hasUnset:
    case FilterOperatorKey.allSet:
      return undefined;
    case FilterOperatorKey.inLastDays:
    case FilterOperatorKey.notInLastDays:
      return value === undefined || value === null ? undefined : String(value);
    default:
      return value === undefined || value === null ? undefined : String(value);
  }
}

function decodeFilterToken(token: string): Filter | undefined {
  try {
    if (token.startsWith("v2.")) {
      const result = FilterSchema.safeParse(JSON.parse(token.slice(3)));
      return result.success ? result.data : undefined;
    }
    const parts = token.split(":");
    const validOperators = Object.values(FilterOperatorKey) as string[];
    const operatorIndex = parts.findIndex((part, index) => index > 0 && validOperators.includes(part));
    const field = parts.slice(0, operatorIndex).join(":");
    const opCode = parts[operatorIndex];
    const rest = parts.slice(operatorIndex + 1).join(":");
    const operator = validOperators.includes(opCode) ? (opCode as FilterOperatorKey) : undefined;

    if (!field || !operator) return undefined;

    let value: unknown = undefined;

    switch (operator) {
      case FilterOperatorKey.in:
      case FilterOperatorKey.notIn:
      case FilterOperatorKey.between:
        value = decodeListValue(rest);
        break;
      case FilterOperatorKey.isNull:
      case FilterOperatorKey.isNotNull:
      case FilterOperatorKey.hasNone:
      case FilterOperatorKey.hasSome:
      case FilterOperatorKey.hasUnset:
      case FilterOperatorKey.allSet:
        value = undefined;
        break;
      case FilterOperatorKey.inLastDays:
      case FilterOperatorKey.notInLastDays:
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

function decodeListValue(token: string): string[] {
  if (!token.startsWith(JSON_LIST_PREFIX)) return token ? token.split(",") : [];
  const parsed: unknown = JSON.parse(token.slice(JSON_LIST_PREFIX.length));
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string"))
    throw new Error("Invalid filter list token");
  return parsed as string[];
}
