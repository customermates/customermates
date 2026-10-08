import type { Filter, FilterableField } from "@/core/base/base-get.schema";

import { normalizeFilterInput } from "@/core/base/filter-value";

export interface SortableField {
  field: string;
  resolvedFields: string[];
  collate?: boolean;
  nullable?: boolean;
}

export type TextSort = {
  fields: string[];
  direction: "asc" | "desc";
};

export interface SearchableField {
  field: string;
}

export enum ViewMode {
  table = "table",
  card = "card",
}

export enum FilterOperatorKey {
  equals = "equals",
  contains = "contains",
  startsWith = "startsWith",
  in = "in",
  notIn = "notIn",
  gt = "gt",
  gte = "gte",
  lt = "lt",
  lte = "lte",
  between = "between",
  isNull = "isNull",
  isNotNull = "isNotNull",
  hasNone = "hasNone",
  hasSome = "hasSome",
  hasAnyOf = "hasAnyOf",
  hasAllOf = "hasAllOf",
  hasNoneOf = "hasNoneOf",
  hasUnset = "hasUnset",
  allSet = "allSet",
  inLastDays = "inLastDays",
  notInLastDays = "notInLastDays",
}

function isMissingSortValue(value: unknown): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

export function compareSortValues(
  a: readonly unknown[],
  b: readonly unknown[],
  direction: "asc" | "desc",
  collator: Pick<Intl.Collator, "compare">,
): number {
  for (const [index, left] of a.entries()) {
    const right = b[index];
    if (isMissingSortValue(left) || isMissingSortValue(right)) {
      if (isMissingSortValue(left) && isMissingSortValue(right)) continue;
      return isMissingSortValue(left) ? 1 : -1;
    }

    const cmp =
      typeof left === "string" && typeof right === "string"
        ? collator.compare(left, right)
        : Number(left) - Number(right);
    if (cmp !== 0) return direction === "asc" ? cmp : -cmp;
  }

  return 0;
}

const COMPARISON_OPS = [FilterOperatorKey.gt, FilterOperatorKey.gte, FilterOperatorKey.lt, FilterOperatorKey.lte];

function isDateLikeField(operators: FilterOperatorKey[]): boolean {
  return operators.includes(FilterOperatorKey.between);
}

function isNumericField(operators: FilterOperatorKey[]): boolean {
  return !isDateLikeField(operators) && COMPARISON_OPS.some((op) => operators.includes(op));
}

export function defaultValidateFilters(args: {
  filters: Filter[] | undefined;
  filterableFields: FilterableField[];
}): Filter[] {
  const { filters, filterableFields } = args;
  if (!Array.isArray(filters)) return [];

  const result: Filter[] = [];

  for (const candidate of filters) {
    const hasValidStructure =
      candidate &&
      typeof candidate === "object" &&
      candidate.field &&
      typeof candidate.field === "string" &&
      candidate.operator &&
      typeof candidate.operator === "string";

    if (!hasValidStructure) continue;

    const filter = normalizeFilterInput(candidate) as Filter;
    const fieldConfig = filterableFields.find((f) => f.field === filter.field);
    if (!fieldConfig || !fieldConfig.operators.includes(filter.operator)) continue;

    if (!isFilterValueWellFormed(filter, fieldConfig.operators)) continue;

    result.push(filter);
  }

  return result;
}

export function isStandaloneOperator(operator?: FilterOperatorKey) {
  if (!operator) return false;

  return [
    FilterOperatorKey.isNull,
    FilterOperatorKey.isNotNull,
    FilterOperatorKey.hasNone,
    FilterOperatorKey.hasSome,
    FilterOperatorKey.hasUnset,
    FilterOperatorKey.allSet,
  ].includes(operator);
}

function isFilterValueWellFormed(filter: Filter, fieldOperators: FilterOperatorKey[]): boolean {
  if (isStandaloneOperator(filter.operator)) {
    const isRelationshipExistence =
      filter.operator === FilterOperatorKey.hasNone || filter.operator === FilterOperatorKey.hasSome;
    return !isRelationshipExistence || !("value" in filter) || filter.value === undefined;
  }

  const rawValue: unknown = "value" in filter ? filter.value : undefined;

  if (filter.operator === FilterOperatorKey.inLastDays || filter.operator === FilterOperatorKey.notInLastDays) {
    const n = Number(rawValue);
    return Number.isInteger(n) && n > 0;
  }

  if (filter.operator === FilterOperatorKey.between) {
    if (!Array.isArray(rawValue) || rawValue.length !== 2) return false;
  } else if (Array.isArray(rawValue)) {
    if (rawValue.length === 0) return false;
  } else if (rawValue === undefined || rawValue === null || rawValue === "") return false;

  const values = Array.isArray(rawValue) ? rawValue : [rawValue];

  if (isDateLikeField(fieldOperators))
    return values.every((v) => typeof v === "string" && !Number.isNaN(new Date(v).getTime()));

  if (isNumericField(fieldOperators))
    return values.every((v) => v !== "" && v !== null && v !== undefined && !Number.isNaN(Number(v)));

  return true;
}
