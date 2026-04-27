import { FilterFieldKey } from "./filter-field-key";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

const relationOperators = [
  FilterOperatorKey.in,
  FilterOperatorKey.notIn,
  FilterOperatorKey.hasNone,
  FilterOperatorKey.hasSome,
];

const dateOperators = [
  FilterOperatorKey.equals,
  FilterOperatorKey.gt,
  FilterOperatorKey.gte,
  FilterOperatorKey.lt,
  FilterOperatorKey.lte,
  FilterOperatorKey.between,
];

const stringArrayOperators = [FilterOperatorKey.equals, FilterOperatorKey.isNull, FilterOperatorKey.isNotNull];

export const FILTER_FIELD_DEFAULT_OPERATORS: Record<FilterFieldKey, FilterOperatorKey[]> = {
  [FilterFieldKey.userIds]: relationOperators,
  [FilterFieldKey.serviceIds]: relationOperators,
  [FilterFieldKey.dealIds]: relationOperators,
  [FilterFieldKey.organizationIds]: relationOperators,
  [FilterFieldKey.contactIds]: relationOperators,
  [FilterFieldKey.emails]: stringArrayOperators,
  [FilterFieldKey.updatedAt]: dateOperators,
  [FilterFieldKey.createdAt]: dateOperators,
  [FilterFieldKey.event]: [FilterOperatorKey.in, FilterOperatorKey.notIn],
  [FilterFieldKey.status]: [FilterOperatorKey.in, FilterOperatorKey.notIn],
};
