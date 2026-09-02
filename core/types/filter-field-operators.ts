import { FilterFieldKey } from "./filter-field-key";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

const relationOperators = [
  FilterOperatorKey.in,
  FilterOperatorKey.notIn,
  FilterOperatorKey.hasNone,
  FilterOperatorKey.hasSome,
];

const dateOperators = [
  FilterOperatorKey.gt,
  FilterOperatorKey.gte,
  FilterOperatorKey.lt,
  FilterOperatorKey.lte,
  FilterOperatorKey.between,
  FilterOperatorKey.inLastDays,
];

const scalarSelectOperators = [FilterOperatorKey.in, FilterOperatorKey.notIn];

const stringOperators = [FilterOperatorKey.equals, FilterOperatorKey.contains];

export const FILTER_FIELD_DEFAULT_OPERATORS: Record<FilterFieldKey, FilterOperatorKey[]> = {
  [FilterFieldKey.userIds]: relationOperators,
  [FilterFieldKey.serviceIds]: relationOperators,
  [FilterFieldKey.dealIds]: relationOperators,
  [FilterFieldKey.organizationIds]: relationOperators,
  [FilterFieldKey.contactIds]: relationOperators,
  [FilterFieldKey.participantContactId]: scalarSelectOperators,
  [FilterFieldKey.participants]: [FilterOperatorKey.hasUnset, FilterOperatorKey.allSet],
  [FilterFieldKey.timelineKind]: scalarSelectOperators,
  [FilterFieldKey.timelineThreadId]: scalarSelectOperators,
  [FilterFieldKey.taskIds]: relationOperators,
  [FilterFieldKey.updatedAt]: dateOperators,
  [FilterFieldKey.createdAt]: dateOperators,
  [FilterFieldKey.event]: scalarSelectOperators,
  [FilterFieldKey.url]: stringOperators,
  [FilterFieldKey.status]: scalarSelectOperators,
  [FilterFieldKey.provider]: scalarSelectOperators,
  [FilterFieldKey.state]: scalarSelectOperators,
  [FilterFieldKey.connectedAccountId]: scalarSelectOperators,
  [FilterFieldKey.calendarId]: scalarSelectOperators,
  [FilterFieldKey.startsAt]: dateOperators,
  [FilterFieldKey.plan]: scalarSelectOperators,
  [FilterFieldKey.subscriptionStatus]: scalarSelectOperators,
  [FilterFieldKey.isPlatformOperator]: scalarSelectOperators,
  [FilterFieldKey.lastActiveAt]: dateOperators,
  [FilterFieldKey.workspaceId]: scalarSelectOperators,
  [FilterFieldKey.adProvider]: scalarSelectOperators,
  [FilterFieldKey.auditSource]: scalarSelectOperators,
};
