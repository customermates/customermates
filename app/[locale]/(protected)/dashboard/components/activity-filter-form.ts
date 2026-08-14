import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { ActivityKind } from "@/ee/messaging/activities/activities.schema";

import { cloneDeep } from "lodash";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

export const ACTIVITY_TYPE_VALUES = ["changes", "messages", "activities"] as const;

export type ActivityTypeValue = (typeof ACTIVITY_TYPE_VALUES)[number];

type ActivityTypeSelection = {
  operator: FilterOperatorKey.in | FilterOperatorKey.notIn | undefined;
  value: Array<ActivityTypeValue | ActivityKind> | undefined;
};

const ACTIVITY_KINDS_BY_TYPE: Record<ActivityTypeValue, readonly ActivityKind[]> = {
  changes: ["audit"],
  messages: ["message"],
  activities: ["activity", "calendar_event"],
};

const ALL_ACTIVITY_KINDS = ACTIVITY_TYPE_VALUES.flatMap((type) => ACTIVITY_KINDS_BY_TYPE[type]);
const ACTIVITY_KINDS_BY_FILTER_VALUE: Record<string, readonly ActivityKind[]> = {
  ...ACTIVITY_KINDS_BY_TYPE,
  audit: ["audit"],
  message: ["message"],
  activity: ["activity"],
  calendar_event: ["calendar_event"],
};

function filterValues(filter: Filter | undefined): string[] {
  if (!filter || !("value" in filter) || !Array.isArray(filter.value)) return [];
  return filter.value;
}

export function activityTypeStateForFilter(
  filter: Filter | undefined,
  type: ActivityTypeValue,
): boolean | "indeterminate" {
  const allowedKinds = allowedActivityKindsForFilter(filter);
  const kinds = ACTIVITY_KINDS_BY_TYPE[type];
  const selectedCount = kinds.filter((kind) => allowedKinds.has(kind)).length;
  if (selectedCount === 0) return false;
  if (selectedCount === kinds.length) return true;
  return "indeterminate";
}

function allowedActivityKindsForFilter(filter: Filter | undefined): Set<ActivityKind> {
  const values = filterValues(filter);
  if (!filter?.operator || values.length === 0) return new Set(ALL_ACTIVITY_KINDS);

  const filteredKinds = new Set(values.flatMap((value) => ACTIVITY_KINDS_BY_FILTER_VALUE[value] ?? []));
  if (filter.operator === FilterOperatorKey.in) return filteredKinds;
  if (filter.operator === FilterOperatorKey.notIn)
    return new Set(ALL_ACTIVITY_KINDS.filter((kind) => !filteredKinds.has(kind)));

  return new Set(ALL_ACTIVITY_KINDS);
}

export function activityTypeSelectionFor(
  filter: Filter | undefined,
  type: ActivityTypeValue,
  checked: boolean,
): ActivityTypeSelection {
  const allowedKinds = allowedActivityKindsForFilter(filter);
  for (const kind of ACTIVITY_KINDS_BY_TYPE[type]) {
    if (checked) allowedKinds.add(kind);
    else allowedKinds.delete(kind);
  }

  if (allowedKinds.size === ALL_ACTIVITY_KINDS.length) return { operator: undefined, value: undefined };
  if (allowedKinds.size === 0) {
    return {
      operator: FilterOperatorKey.notIn,
      value: [...ACTIVITY_TYPE_VALUES],
    };
  }

  const value = ACTIVITY_TYPE_VALUES.flatMap((candidate) => {
    const kinds = ACTIVITY_KINDS_BY_TYPE[candidate];
    const selectedKinds = kinds.filter((kind) => allowedKinds.has(kind));
    if (selectedKinds.length === kinds.length) return [candidate];
    return selectedKinds;
  });

  return { operator: FilterOperatorKey.in, value };
}

const ACTIVITY_FILTER_ORDER: FilterFieldKey[] = [
  FilterFieldKey.contactIds,
  FilterFieldKey.organizationIds,
  FilterFieldKey.dealIds,
  FilterFieldKey.serviceIds,
  FilterFieldKey.taskIds,
  FilterFieldKey.timelineKind,
  FilterFieldKey.provider,
  FilterFieldKey.connectedAccountId,
  FilterFieldKey.timelineThreadId,
];

function orderFor(field: string): number {
  const index = ACTIVITY_FILTER_ORDER.indexOf(field as FilterFieldKey);
  return index === -1 ? ACTIVITY_FILTER_ORDER.length : index;
}

export function mergeActivityFiltersForForm(
  filterableFields: FilterableField[],
  currentFilters: Filter[] = [],
): Filter[] {
  const existingByField = new Map(currentFilters.map((filter) => [filter.field, filter]));
  const visibleFields = new Set(filterableFields.map((field) => field.field));
  const visible = filterableFields
    .map((field) => {
      const existing = existingByField.get(field.field);
      return existing
        ? cloneDeep(existing)
        : ({
            field: field.field,
            operator: undefined,
            value: undefined,
          } as unknown as Filter);
    })
    .sort((left, right) => orderFor(left.field) - orderFor(right.field));
  const hidden = currentFilters.filter((filter) => !visibleFields.has(filter.field)).map(cloneDeep);

  return [...visible, ...hidden];
}
