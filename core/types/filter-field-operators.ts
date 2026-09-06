import { CustomColumnType } from "@/generated/prisma";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

import { FilterFieldKey } from "./filter-field-key";

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
const textFieldOperators = [FilterOperatorKey.equals, FilterOperatorKey.startsWith, FilterOperatorKey.contains];

const nullableOperators = [FilterOperatorKey.isNull, FilterOperatorKey.isNotNull];
const customComparisonOperators = [
  FilterOperatorKey.gt,
  FilterOperatorKey.gte,
  FilterOperatorKey.lt,
  FilterOperatorKey.lte,
];
const customDateOperators = [...customComparisonOperators, FilterOperatorKey.between, ...nullableOperators];
const customStringOperators = [...stringOperators, ...nullableOperators];

export const CUSTOM_COLUMN_DEFAULT_OPERATORS: Record<CustomColumnType, FilterOperatorKey[]> = {
  [CustomColumnType.singleSelect]: [...scalarSelectOperators, ...nullableOperators],
  [CustomColumnType.currency]: [FilterOperatorKey.equals, ...customComparisonOperators, ...nullableOperators],
  [CustomColumnType.date]: customDateOperators,
  [CustomColumnType.dateTime]: customDateOperators,
  [CustomColumnType.dateRange]: [FilterOperatorKey.contains, ...customDateOperators],
  [CustomColumnType.dateTimeRange]: [FilterOperatorKey.contains, ...customDateOperators],
  [CustomColumnType.email]: customStringOperators,
  [CustomColumnType.phone]: customStringOperators,
  [CustomColumnType.plain]: customStringOperators,
  [CustomColumnType.link]: customStringOperators,
};

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
  [FilterFieldKey.workspaceTags]: scalarSelectOperators,
  [FilterFieldKey.name]: textFieldOperators,
  [FilterFieldKey.firstName]: textFieldOperators,
  [FilterFieldKey.lastName]: textFieldOperators,
};
