import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterValueClass } from "@/components/data-view/filter-modal/filter-value-class";

import { resolveFilterValueClass } from "@/components/data-view/filter-modal/filter-value-class";
import { FilterOperatorKey, isStandaloneOperator } from "@/core/base/base-query-builder";

export type PalettePageKind = "select" | "text" | "number" | "date" | "operatorOnly";

export type PalettePlan = {
  impliedOperator: FilterOperatorKey | undefined;
  valueClass: FilterValueClass;
  pageKind: PalettePageKind;
  standaloneOperators: FilterOperatorKey[];
};

export const PALETTE_OPERATOR_PREFERENCE: FilterOperatorKey[] = [
  FilterOperatorKey.in,
  FilterOperatorKey.contains,
  FilterOperatorKey.inLastDays,
  FilterOperatorKey.gte,
  FilterOperatorKey.equals,
];

const PAGE_KIND_BY_VALUE_CLASS: Record<FilterValueClass, PalettePageKind> = {
  daysCount: "date",
  isoDate: "date",
  isoRange: "date",
  none: "operatorOnly",
  numericString: "number",
  stringArray: "select",
  text: "text",
  unavailable: "operatorOnly",
};

export function palettePageKind(valueClass: FilterValueClass): PalettePageKind {
  return PAGE_KIND_BY_VALUE_CLASS[valueClass];
}

export function declaredOperatorsOf(field: string, filterableFields: FilterableField[]): FilterOperatorKey[] {
  return filterableFields.find((candidate) => candidate.field === field)?.operators ?? [];
}

export function palettePlan(
  field: string,
  filterableFields: FilterableField[],
  customColumns?: CustomColumnDto[],
): PalettePlan {
  const declared = declaredOperatorsOf(field, filterableFields);
  const impliedOperator = PALETTE_OPERATOR_PREFERENCE.find((operator) => declared.includes(operator));
  const valueClass = resolveFilterValueClass(field, impliedOperator, customColumns);

  return {
    impliedOperator,
    valueClass,
    pageKind: palettePageKind(valueClass),
    standaloneOperators: declared.filter((operator) => isStandaloneOperator(operator)),
  };
}

export function toAppliedFilter(filter: Filter): Filter {
  if (!isStandaloneOperator(filter.operator)) return filter;

  return { field: filter.field, operator: filter.operator } as Filter;
}
