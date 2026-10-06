import type { Filter, FilterableField, GetQueryParams } from "@/core/base/base-get.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { RecordDto, RecordField, RecordRelationship, RecordScalar, RecordType } from "./record-model.schema";
import type { RecordQuery } from "./record-query.schema";

import { toChipColor } from "@/constants/chip-colors";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import {
  parseRelationshipColumnKey,
  parseRelationshipPathColumnKey,
  relationshipColumnKey,
  relationshipPathColumnKey,
} from "./record-column.schema";
import { recordFilterOperators } from "./record-filter";
import { RecordQuerySchema } from "./record-query.schema";
import type { RecordRelationshipPath } from "./record-relationship-path.schema";

export type RecordRow = RecordDto & { id: string };
export function recordColumnPresentation(field: RecordField): ColumnPresentation {
  const base = { id: field.id, label: field.label };
  if (field.valueType === "select") {
    return {
      ...base,
      type: "singleSelect",
      options: {
        options: field.options.map((option, index) => ({
          value: option.id,
          label: option.label,
          index,
          isDefault:
            field.behavior.kind === "input" &&
            field.behavior.defaultValue?.kind === "select" &&
            field.behavior.defaultValue.value === option.id,
          color: toChipColor(option.color),
        })),
      },
    };
  }
  if (field.valueType === "member" || field.valueType === "boolean") return { ...base, type: field.valueType };
  if (field.valueType === "number" || field.valueType === "currency") return { ...base, type: "number" };
  if (["date", "dateTime", "dateRange", "dateTimeRange"].includes(field.valueType)) {
    return {
      ...base,
      type: field.valueType as "date" | "dateTime" | "dateRange" | "dateTimeRange",
    };
  }
  return { ...base, type: "plain" };
}
export function recordFilterableFields(
  fields: RecordField[],
  relationships: RecordRelationship[] = [],
  typeId?: string,
  paths: RecordRelationshipPath[] = [],
): FilterableField[] {
  const date = { valueType: "dateTime" as const, multiple: false };
  const definitions = [
    ...fields.filter((field) => !field.archived),
    { ...date, id: "system:createdAt", label: "createdAt" },
    { ...date, id: "system:updatedAt", label: "updatedAt" },
    { id: "system:assignedTo", label: "assignedTo", valueType: "member" as const, multiple: false },
  ];
  return [
    ...paths
      .filter((path) => !path.archived)
      .map((path) => ({
        field: relationshipPathColumnKey(path.id),
        label: path.label,
        operators: [
          FilterOperatorKey.in,
          FilterOperatorKey.notIn,
          FilterOperatorKey.hasSome,
          FilterOperatorKey.hasNone,
        ],
      })),
    ...definitions.flatMap((field) => {
      const operators = recordFilterOperators(field)
        .flatMap((operator) => {
          if (operator === "ne") return [];
          if (operator === "eq") return [FilterOperatorKey.equals];
          if (operator === "empty") return [FilterOperatorKey.isNull];
          if (operator === "notEmpty") return [FilterOperatorKey.isNotNull];
          return [FilterOperatorKey[operator]];
        })
        .filter(
          (operator) =>
            !["select", "member", "boolean"].includes(field.valueType) || operator !== FilterOperatorKey.equals,
        );
      if (field.id === "system:assignedTo") operators.push(FilterOperatorKey.hasSome, FilterOperatorKey.hasNone);

      return operators.length ? [{ field: field.id, label: field.label, operators }] : [];
    }),
    ...relationships
      .filter((relation) => !relation.archived)
      .flatMap((relation) =>
        (["outgoing", "incoming"] as const).flatMap((direction) =>
          (direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) === typeId
            ? [
                {
                  field: relationshipColumnKey(relation.id, direction),
                  label: direction === "outgoing" ? relation.sourceLabel : relation.targetLabel,
                  operators: [
                    FilterOperatorKey.in,
                    FilterOperatorKey.notIn,
                    FilterOperatorKey.hasSome,
                    FilterOperatorKey.hasNone,
                  ],
                },
              ]
            : [],
        ),
      ),
  ];
}
export function recordDefaults(type: RecordType): DataViewState {
  return {
    columnOrder: type.defaults.columns,
    hiddenColumns: type.defaults.hiddenColumns,
    viewMode: type.defaults.layout === "board" ? ViewMode.card : ViewMode.table,
    grouping: type.defaults.groupBy
      ? { field: type.defaults.groupBy, ...(type.defaults.groupBucket ? { bucket: type.defaults.groupBucket } : {}) }
      : null,
    sortDescriptor: type.defaults.sortField
      ? {
          field: type.defaults.sortField,
          direction: type.defaults.sortDirection,
        }
      : null,
  };
}
export function filterScalar(
  raw: string,
  field: Pick<RecordField, "valueType" | "format">,
  currency: string,
): RecordScalar {
  if (field.valueType === "select") return { kind: "select", value: raw };
  if (field.valueType === "number" || field.valueType === "currency") {
    return {
      kind: "decimal",
      value: raw,
      currency: field.valueType === "currency" ? (field.format?.currency ?? currency.toUpperCase()) : null,
    };
  }
  if (["date", "dateTime", "dateRange", "dateTimeRange"].includes(field.valueType))
    return { kind: field.valueType === "date" || field.valueType === "dateRange" ? "date" : "dateTime", value: raw };
  if (field.valueType === "boolean") {
    if (raw !== "true" && raw !== "false") throw new Error("Boolean filter requires true or false");
    return { kind: "boolean", value: raw === "true" };
  }
  if (field.valueType === "member") return { kind: "member", value: raw };
  return { kind: "text", value: raw };
}
export function presentationQuery(
  typeId: string,
  fields: RecordField[],
  params: Pick<GetQueryParams, "filters" | "searchTerm" | "sortDescriptor" | "pagination" | "page" | "pageSize">,
  currency: string,
  relations: RecordRelationship[] = [],
  paths: RecordRelationshipPath[] = [],
): RecordQuery {
  const filters: RecordQuery["filters"] = [];
  const relationships: RecordQuery["relationships"] = [];
  const relatedFilters: NonNullable<RecordQuery["relatedFilters"]> = [];
  if (!presentationFiltersAreValid(params.filters ?? [], fields, relations, typeId, paths))
    throw new Error("Invalid presentation filter");
  const operators = {
    equals: "eq",
    contains: "contains",
    startsWith: "startsWith",
    gt: "gt",
    gte: "gte",
    lt: "lt",
    lte: "lte",
  } as const;
  for (const filter of params.filters ?? []) {
    const pathId = parseRelationshipPathColumnKey(filter.field);
    if (pathId) {
      const definition = paths.find((path) => path.id === pathId && !path.archived);
      if (!definition) throw new Error("Unknown relationship path");
      relatedFilters.push({
        path: definition.path,
        operator: [FilterOperatorKey.notIn, FilterOperatorKey.hasNone].includes(filter.operator) ? "none" : "any",
        filters: [],
        relationships: [],
        ...(filter.operator === FilterOperatorKey.in || filter.operator === FilterOperatorKey.notIn
          ? { recordIds: filter.value }
          : {}),
      });
      continue;
    }
    const relationship = parseRelationshipColumnKey(filter.field);
    if (relationship) {
      relationships.push({
        relationId: relationship.relationId,
        direction: relationship.direction,
        operator: [FilterOperatorKey.notIn, FilterOperatorKey.hasNone].includes(filter.operator) ? "none" : "any",
        recordIds:
          filter.operator === FilterOperatorKey.in || filter.operator === FilterOperatorKey.notIn ? filter.value : null,
      });
      continue;
    }
    const field =
      fields.find((field) => field.id === filter.field) ??
      (["system:createdAt", "system:updatedAt"].includes(filter.field)
        ? { id: filter.field, valueType: "dateTime" as const }
        : filter.field === "system:assignedTo"
          ? { id: filter.field, valueType: "member" as const }
          : undefined);
    if (!field) throw new Error("Unknown presentation filter field");
    if (
      [
        FilterOperatorKey.isNull,
        FilterOperatorKey.isNotNull,
        FilterOperatorKey.hasSome,
        FilterOperatorKey.hasNone,
      ].includes(filter.operator)
    ) {
      filters.push({
        fieldId: field.id,
        operator: [FilterOperatorKey.isNull, FilterOperatorKey.hasNone].includes(filter.operator)
          ? "empty"
          : "notEmpty",
        value: null,
      });
    } else if (
      filter.operator === FilterOperatorKey.inLastDays ||
      filter.operator === FilterOperatorKey.notInLastDays
    ) {
      filters.push({
        fieldId: field.id,
        operator: filter.operator,
        value: { kind: "decimal", value: String(filter.value), currency: null },
      });
    } else if (
      filter.operator === FilterOperatorKey.in ||
      filter.operator === FilterOperatorKey.notIn ||
      filter.operator === FilterOperatorKey.between
    ) {
      filters.push({
        fieldId: field.id,
        operator: filter.operator,
        value: null,
        values: filter.value.map((value) => filterScalar(value, field, currency)),
      });
    } else if (filter.operator in operators && "value" in filter && typeof filter.value === "string") {
      filters.push({
        fieldId: field.id,
        operator: operators[filter.operator as keyof typeof operators],
        value: filterScalar(filter.value, field, currency),
      });
    } else throw new Error("Unsupported presentation filter");
  }
  return RecordQuerySchema.parse({
    typeId,
    filters,
    relationships,
    ...(relatedFilters.length ? { relatedFilters } : {}),
    search: params.searchTerm,
    sort: params.sortDescriptor
      ? [
          {
            fieldId: params.sortDescriptor.field,
            direction: params.sortDescriptor.direction,
          },
        ]
      : [],
    page: params.page ?? params.pagination?.page ?? 1,
    pageSize: params.pageSize ?? params.pagination?.pageSize ?? 25,
  });
}
export function presentationFiltersAreValid(
  filters: Filter[],
  fields: RecordField[],
  relationships: RecordRelationship[] = [],
  typeId?: string,
  paths: RecordRelationshipPath[] = [],
): boolean {
  const definitions = recordFilterableFields(fields, relationships, typeId, paths);
  return filters.every((filter) =>
    definitions.some((field) => field.field === filter.field && field.operators.includes(filter.operator)),
  );
}
