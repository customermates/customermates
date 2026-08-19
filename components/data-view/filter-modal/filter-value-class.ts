import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { hasValidFilterConfiguration, isCustomField } from "@/components/data-view/table-view.utils";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey, isStandaloneOperator } from "@/core/base/base-query-builder";

export type FilterValueClass =
  | "none"
  | "unavailable"
  | "stringArray"
  | "text"
  | "numericString"
  | "isoDate"
  | "isoRange"
  | "daysCount";

export type FilterDateGranularity = "day" | "minute";

const RELATION_FILTER_FIELDS = [
  FilterFieldKey.userIds,
  FilterFieldKey.contactIds,
  FilterFieldKey.participantContactId,
  FilterFieldKey.serviceIds,
  FilterFieldKey.dealIds,
  FilterFieldKey.organizationIds,
  FilterFieldKey.taskIds,
  FilterFieldKey.event,
  FilterFieldKey.status,
  FilterFieldKey.provider,
  FilterFieldKey.state,
  FilterFieldKey.timelineKind,
  FilterFieldKey.timelineThreadId,
  FilterFieldKey.connectedAccountId,
  FilterFieldKey.participants,
];

const DATE_FILTER_FIELDS = [FilterFieldKey.updatedAt, FilterFieldKey.createdAt];

const DAY_GRANULARITY_COLUMN_TYPES = ["date", "dateRange"];

function dateValueClass(operator: FilterOperatorKey): FilterValueClass {
  if (operator === FilterOperatorKey.inLastDays) return "daysCount";

  return operator === FilterOperatorKey.between ? "isoRange" : "isoDate";
}

export function resolveFilterValueClass(
  field: string,
  operator: FilterOperatorKey | undefined,
  customColumns?: CustomColumnDto[],
): FilterValueClass {
  if (!operator || isStandaloneOperator(operator)) return "none";

  if (isCustomField(field)) {
    const customColumn = customColumns?.find((column) => column.id === field);
    if (!customColumn) return "unavailable";

    switch (customColumn.type) {
      case "singleSelect":
        return "stringArray";
      case "currency":
        return "numericString";
      case "date":
      case "dateRange":
      case "dateTime":
      case "dateTimeRange":
        return dateValueClass(operator);
      case "link":
      case "plain":
      case "email":
      case "phone":
        return "text";
    }

    return "text";
  }

  if (RELATION_FILTER_FIELDS.includes(field as FilterFieldKey)) return "stringArray";
  if (DATE_FILTER_FIELDS.includes(field as FilterFieldKey)) return dateValueClass(operator);

  return "text";
}

export function resolveFilterDateGranularity(field: string, customColumns?: CustomColumnDto[]): FilterDateGranularity {
  if (!isCustomField(field)) return "minute";

  const customColumn = customColumns?.find((column) => column.id === field);

  return customColumn && DAY_GRANULARITY_COLUMN_TYPES.includes(customColumn.type) ? "day" : "minute";
}

function isValueUsableAs(value: unknown, valueClass: FilterValueClass): boolean {
  if (valueClass === "stringArray")
    return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string");

  if (valueClass === "text") return typeof value === "string" && value.length > 0;

  if (valueClass === "numericString")
    return (typeof value === "string" || typeof value === "number") && value !== "" && Number.isFinite(Number(value));

  if (valueClass === "isoDate") return typeof value === "string" && !Number.isNaN(new Date(value).getTime());

  return false;
}

export function shouldPreserveFilterValue(
  filter: Filter,
  next: FilterOperatorKey | undefined,
  customColumns?: CustomColumnDto[],
): boolean {
  const previous = filter.operator as FilterOperatorKey | undefined;

  if (!next || isStandaloneOperator(next)) return false;
  if (!previous || isStandaloneOperator(previous)) return false;
  if (previous === next) return true;
  if (previous === FilterOperatorKey.between || next === FilterOperatorKey.between) return false;
  if (previous === FilterOperatorKey.inLastDays || next === FilterOperatorKey.inLastDays) return false;

  const valueClass = resolveFilterValueClass(filter.field, previous, customColumns);
  if (valueClass !== resolveFilterValueClass(filter.field, next, customColumns)) return false;

  const value = "value" in filter ? filter.value : undefined;
  if (!isValueUsableAs(value, valueClass)) return false;

  return hasValidFilterConfiguration({ ...filter, operator: next } as Filter);
}
