import type { Filter } from "@/core/base/base-get.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

export { isCustomField } from "@/core/utils/custom-field";

import { isStandaloneOperator } from "@/core/base/base-query-builder";

export function hasValidFilterConfiguration(filter: Filter) {
  if (isStandaloneOperator(filter.operator)) return true;

  if (filter.operator === FilterOperatorKey.in || filter.operator === FilterOperatorKey.notIn)
    return "value" in filter && Array.isArray(filter.value) ? filter.value.length > 0 : false;

  if (filter.operator === FilterOperatorKey.between)
    return "value" in filter && Array.isArray(filter.value) && filter.value.length === 2;

  return "value" in filter && filter.value !== undefined && filter.value !== null && String(filter.value).length > 0;
}
