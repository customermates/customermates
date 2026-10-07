import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { RecordField, RecordModel, RecordRelationship, RecordScalar } from "./record-model.schema";
import type { RecordQuery } from "./record-query.schema";
import type { RecordPathStep } from "./record-relationship-path.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

import { parseRelationshipColumnKey, relationshipColumnKey } from "./record-column.schema";
import { filterScalar, recordColumnPresentation, recordFilterableFields } from "./record-presentation";

type RecordFilter = RecordQuery["filters"][number];
type RecordRelatedFilter = NonNullable<RecordQuery["relatedFilters"]>[number];
type QueryFilters = Pick<RecordQuery, "filters" | "relationships" | "relatedFilters">;
type SystemLabels = {
  createdAt: string;
  updatedAt: string;
  assignedTo: string;
};

const RELATED_FIELD_PREFIX = "related:";
const RELATED_RECORD_PREFIX = "relatedRecord:";
const LINK_OPERATORS = [
  FilterOperatorKey.in,
  FilterOperatorKey.notIn,
  FilterOperatorKey.hasSome,
  FilterOperatorKey.hasNone,
];
const MAX_RELATED_DEPTH = 2;

const encodePath = (path: RecordPathStep[]) =>
  path.map((step) => `${step.relationId}.${step.direction === "outgoing" ? "o" : "i"}`).join("/");

function decodePath(encoded: string): RecordPathStep[] | null {
  const steps = encoded.split("/").map((part) => {
    const [relationId, direction] = part.split(".");
    if (!relationId || (direction !== "o" && direction !== "i")) return null;
    return {
      relationId,
      direction: direction === "o" ? ("outgoing" as const) : ("incoming" as const),
    };
  });
  return steps.length && steps.every(Boolean) ? (steps as RecordPathStep[]) : null;
}

export const relatedFieldKey = (path: RecordPathStep[], fieldId: string) =>
  `${RELATED_FIELD_PREFIX}${encodePath(path)}:${fieldId}`;

export const relatedRecordKey = (path: RecordPathStep[]) => `${RELATED_RECORD_PREFIX}${encodePath(path)}`;

export function parseRelatedFieldKey(key: string): { path: RecordPathStep[]; fieldId: string } | null {
  if (!key.startsWith(RELATED_FIELD_PREFIX)) return null;
  const rest = key.slice(RELATED_FIELD_PREFIX.length);
  const separator = rest.indexOf(":");
  if (separator < 0) return null;
  const path = decodePath(rest.slice(0, separator));
  const fieldId = rest.slice(separator + 1);
  return path && fieldId ? { path, fieldId } : null;
}

export function parseRelatedRecordKey(key: string): RecordPathStep[] | null {
  return key.startsWith(RELATED_RECORD_PREFIX) ? decodePath(key.slice(RELATED_RECORD_PREFIX.length)) : null;
}

function liveRelationships(model: RecordModel) {
  return model.relationships.filter((relation) => !relation.archived);
}

function stepFrom(relation: RecordRelationship, direction: RecordPathStep["direction"]) {
  return {
    target: direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId,
    label: direction === "outgoing" ? relation.sourceLabel : relation.targetLabel,
  };
}

function pathEnd(model: RecordModel, typeId: string, path: RecordPathStep[]) {
  let current = typeId;
  const labels: string[] = [];
  for (const step of path) {
    const relation = liveRelationships(model).find((candidate) => candidate.id === step.relationId);
    if (!relation) return null;
    const origin = step.direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId;
    if (origin !== current) return null;
    const next = stepFrom(relation, step.direction);
    labels.push(next.label);
    current = next.target;
  }
  return { typeId: current, label: labels.join(" › ") };
}

function outgoingSteps(model: RecordModel, typeId: string): RecordPathStep[] {
  return liveRelationships(model).flatMap((relation) =>
    (["outgoing", "incoming"] as const).flatMap((direction) =>
      (direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) === typeId
        ? [{ relationId: relation.id, direction }]
        : [],
    ),
  );
}

function reachablePaths(model: RecordModel, typeId: string, extra: RecordPathStep[][]): RecordPathStep[][] {
  const paths: RecordPathStep[][] = [];
  const visit = (path: RecordPathStep[], at: string) => {
    if (path.length) paths.push(path);
    if (path.length === MAX_RELATED_DEPTH) return;
    for (const step of outgoingSteps(model, at)) {
      const end = pathEnd(model, typeId, [...path, step]);
      if (end) visit([...path, step], end.typeId);
    }
  };
  visit([], typeId);
  const known = new Set(paths.map(encodePath));
  return [...paths, ...extra.filter((path) => !known.has(encodePath(path)) && pathEnd(model, typeId, path))];
}

function typeFields(model: RecordModel, typeId: string): RecordField[] {
  return model.fields.filter((field) => field.typeId === typeId && !field.archived);
}

export function recordFilterTarget(
  model: RecordModel,
  typeId: string,
  labels: SystemLabels,
  existing: Pick<RecordQuery, "relatedFilters"> = {},
): {
  filterableFields: FilterableField[];
  filterColumns: ColumnPresentation[];
} {
  const own = typeFields(model, typeId);
  const relationships = liveRelationships(model);
  const ownFilterable = recordFilterableFields(own, relationships, typeId).map((entry) => ({
    ...entry,
    label: entry.label && entry.field.startsWith("system:") ? labels[entry.label as keyof SystemLabels] : entry.label,
  }));
  const ownColumns: ColumnPresentation[] = [
    ...own.map(recordColumnPresentation),
    { id: "system:createdAt", label: labels.createdAt, type: "dateTime" },
    { id: "system:updatedAt", label: labels.updatedAt, type: "dateTime" },
    { id: "system:assignedTo", label: labels.assignedTo, type: "member" },
    ...outgoingSteps(model, typeId).flatMap((step) => {
      const end = pathEnd(model, typeId, [step]);
      return end
        ? [
            {
              id: relationshipColumnKey(step.relationId, step.direction),
              label: end.label,
              type: "recordReference" as const,
              typeId: end.typeId,
            },
          ]
        : [];
    }),
  ];
  const related = reachablePaths(
    model,
    typeId,
    (existing.relatedFilters ?? []).map((filter) => filter.path),
  ).flatMap((path) => {
    const end = pathEnd(model, typeId, path);
    if (!end) return [];
    const fields = recordFilterableFields(typeFields(model, end.typeId)).filter(
      (entry) => !entry.field.startsWith("system:"),
    );
    const fieldEntries = fields.map((entry) => {
      const field = typeFields(model, end.typeId).find((candidate) => candidate.id === entry.field);
      const key = relatedFieldKey(path, entry.field);
      return {
        filterable: {
          ...entry,
          field: key,
          label: `${end.label} › ${entry.label}`,
        },
        column: field
          ? {
              ...recordColumnPresentation(field),
              id: key,
              label: `${end.label} › ${field.label}`,
            }
          : null,
      };
    });
    const linkEntry =
      path.length > 1
        ? [
            {
              filterable: {
                field: relatedRecordKey(path),
                label: end.label,
                operators: LINK_OPERATORS,
              },
              column: {
                id: relatedRecordKey(path),
                label: end.label,
                type: "recordReference" as const,
                typeId: end.typeId,
              },
            },
          ]
        : [];
    return [...linkEntry, ...fieldEntries];
  });
  return {
    filterableFields: [...ownFilterable, ...related.map((entry) => entry.filterable)],
    filterColumns: [
      ...ownColumns,
      ...related.flatMap((entry) => (entry.column ? [entry.column as ColumnPresentation] : [])),
    ],
  };
}

function scalarText(scalar: RecordScalar | null | undefined): string {
  if (!scalar) return "";
  if (scalar.kind === "boolean") return scalar.value ? "true" : "false";
  return "value" in scalar ? String(scalar.value) : "";
}

function toPaletteFilter(filter: RecordFilter, field: string): Filter | null {
  switch (filter.operator) {
    case "eq":
      return {
        field,
        operator: FilterOperatorKey.equals,
        value: scalarText(filter.value),
      };
    case "ne":
      return {
        field,
        operator: FilterOperatorKey.notIn,
        value: [scalarText(filter.value)],
      };
    case "empty":
      return { field, operator: FilterOperatorKey.isNull };
    case "notEmpty":
      return { field, operator: FilterOperatorKey.isNotNull };
    case "in":
    case "notIn":
    case "between":
      return {
        field,
        operator: FilterOperatorKey[filter.operator],
        value: (filter.values ?? []).map(scalarText),
      } as Filter;
    case "inLastDays":
    case "notInLastDays":
      return {
        field,
        operator: FilterOperatorKey[filter.operator],
        value: Number(scalarText(filter.value)),
      };
    default:
      return {
        field,
        operator: FilterOperatorKey[filter.operator],
        value: scalarText(filter.value),
      } as Filter;
  }
}

function representable(filter: RecordRelatedFilter) {
  if (filter.search || filter.relationships.length) return false;
  if (filter.recordIds) return filter.filters.length === 0;
  return filter.filters.length === 0 ? true : filter.operator === "any";
}

export function recordQueryToPaletteFilters(query: QueryFilters): {
  filters: Filter[];
  retained: RecordRelatedFilter[];
} {
  const filters: Filter[] = [
    ...query.filters.flatMap((filter) => toPaletteFilter(filter, filter.fieldId) ?? []),
    ...query.relationships.map(
      (filter): Filter =>
        filter.recordIds
          ? {
              field: relationshipColumnKey(filter.relationId, filter.direction),
              operator: filter.operator === "any" ? FilterOperatorKey.in : FilterOperatorKey.notIn,
              value: filter.recordIds,
            }
          : {
              field: relationshipColumnKey(filter.relationId, filter.direction),
              operator: filter.operator === "any" ? FilterOperatorKey.hasSome : FilterOperatorKey.hasNone,
            },
    ),
  ];
  const retained: RecordRelatedFilter[] = [];
  for (const related of query.relatedFilters ?? []) {
    if (!representable(related)) {
      retained.push(related);
      continue;
    }
    if (related.filters.length) {
      for (const filter of related.filters) {
        const converted = toPaletteFilter(filter, relatedFieldKey(related.path, filter.fieldId));
        if (converted) filters.push(converted);
      }
      continue;
    }
    filters.push(
      related.recordIds
        ? {
            field: relatedRecordKey(related.path),
            operator: related.operator === "any" ? FilterOperatorKey.in : FilterOperatorKey.notIn,
            value: related.recordIds,
          }
        : {
            field: relatedRecordKey(related.path),
            operator: related.operator === "any" ? FilterOperatorKey.hasSome : FilterOperatorKey.hasNone,
          },
    );
  }
  return { filters, retained };
}

const SINGLE_OPERATORS = {
  [FilterOperatorKey.equals]: "eq",
  [FilterOperatorKey.contains]: "contains",
  [FilterOperatorKey.startsWith]: "startsWith",
  [FilterOperatorKey.gt]: "gt",
  [FilterOperatorKey.gte]: "gte",
  [FilterOperatorKey.lt]: "lt",
  [FilterOperatorKey.lte]: "lte",
} as const;

function fieldShape(model: RecordModel, fieldId: string): Pick<RecordField, "valueType" | "format"> | null {
  if (fieldId === "system:createdAt" || fieldId === "system:updatedAt")
    return { valueType: "dateTime", format: undefined };
  if (fieldId === "system:assignedTo") return { valueType: "member", format: undefined };
  const field = model.fields.find((candidate) => candidate.id === fieldId && !candidate.archived);
  return field ? { valueType: field.valueType, format: field.format } : null;
}

function toRecordFilter(filter: Filter, fieldId: string, model: RecordModel, currency: string): RecordFilter | null {
  const shape = fieldShape(model, fieldId);
  if (!shape) return null;
  const scalar = (raw: string) => filterScalar(raw, shape as RecordField, currency);
  switch (filter.operator) {
    case FilterOperatorKey.isNull:
    case FilterOperatorKey.hasNone:
      return { fieldId, operator: "empty", value: null };
    case FilterOperatorKey.isNotNull:
    case FilterOperatorKey.hasSome:
      return { fieldId, operator: "notEmpty", value: null };
    case FilterOperatorKey.inLastDays:
    case FilterOperatorKey.notInLastDays:
      return {
        fieldId,
        operator: filter.operator,
        value: { kind: "decimal", value: String(filter.value), currency: null },
      };
    case FilterOperatorKey.in:
    case FilterOperatorKey.notIn:
    case FilterOperatorKey.between:
      return {
        fieldId,
        operator: filter.operator,
        value: null,
        values: filter.value.map(scalar),
      };
    default:
      return filter.operator in SINGLE_OPERATORS && "value" in filter && typeof filter.value === "string"
        ? {
            fieldId,
            operator: SINGLE_OPERATORS[filter.operator],
            value: scalar(filter.value),
          }
        : null;
  }
}

function linkOperator(filter: Filter): {
  operator: "any" | "none";
  recordIds: string[] | null;
} {
  const none = filter.operator === FilterOperatorKey.notIn || filter.operator === FilterOperatorKey.hasNone;
  const recordIds =
    (filter.operator === FilterOperatorKey.in || filter.operator === FilterOperatorKey.notIn) &&
    Array.isArray(filter.value)
      ? filter.value
      : null;
  return { operator: none ? "none" : "any", recordIds };
}

export function paletteFiltersToRecordQuery(
  filters: Filter[],
  retained: RecordRelatedFilter[],
  model: RecordModel,
  currency: string,
): QueryFilters {
  const query: Required<QueryFilters> = {
    filters: [],
    relationships: [],
    relatedFilters: [],
  };
  const relatedByPath = new Map<string, RecordRelatedFilter>();
  for (const filter of filters) {
    const relationship = parseRelationshipColumnKey(filter.field);
    if (relationship) {
      query.relationships.push({
        relationId: relationship.relationId,
        direction: relationship.direction,
        ...linkOperator(filter),
      });
      continue;
    }
    const recordPath = parseRelatedRecordKey(filter.field);
    if (recordPath) {
      const { operator, recordIds } = linkOperator(filter);
      query.relatedFilters.push({
        path: recordPath,
        operator,
        filters: [],
        relationships: [],
        ...(recordIds ? { recordIds } : {}),
      });
      continue;
    }
    const related = parseRelatedFieldKey(filter.field);
    if (related) {
      const converted = toRecordFilter(filter, related.fieldId, model, currency);
      if (!converted) continue;
      const key = encodePath(related.path);
      const entry = relatedByPath.get(key) ?? {
        path: related.path,
        operator: "any",
        filters: [],
        relationships: [],
      };
      entry.filters.push(converted);
      if (!relatedByPath.has(key)) {
        relatedByPath.set(key, entry);
        query.relatedFilters.push(entry);
      }
      continue;
    }
    const converted = toRecordFilter(filter, filter.field, model, currency);
    if (converted) query.filters.push(converted);
  }
  query.relatedFilters.push(...retained);
  return query.relatedFilters.length ? query : { filters: query.filters, relationships: query.relationships };
}
