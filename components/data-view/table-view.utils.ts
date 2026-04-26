import type { Filter } from "@/core/base/base-get.schema";

import { z } from "zod";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

export function isCustomField(field: string): boolean {
  return z.uuid().safeParse(field).success;
}

export function isStandaloneOperator(operator?: FilterOperatorKey) {
  if (!operator) return false;

  return [FilterOperatorKey.isNull, FilterOperatorKey.isNotNull].includes(operator);
}

export function hasValidFilterConfiguration(filter: Filter) {
  if (isStandaloneOperator(filter.operator)) return true;

  if (
    filter.operator === FilterOperatorKey.in ||
    filter.operator === FilterOperatorKey.notIn ||
    filter.operator === FilterOperatorKey.hasNone ||
    filter.operator === FilterOperatorKey.hasSome
  )
    return "value" in filter && Array.isArray(filter.value) ? filter.value.length > 0 : false;

  if (filter.operator === FilterOperatorKey.between)
    return "value" in filter && Array.isArray(filter.value) && filter.value.length === 2;

  return "value" in filter && filter.value !== undefined && filter.value !== null && String(filter.value).length > 0;
}
