import equal from "fast-deep-equal/es6";

import type { Filter } from "@/core/base/base-get.schema";
import { isPersistedColumnWidthKey, type DataViewState } from "@/core/data-view/data-view-state.schema";
import type { RecordField, RecordModel, RecordRelationship } from "./record-model.schema";
import type { RecordRelationshipPath } from "./record-relationship-path.schema";

import { presentationFiltersAreValid, presentationQuery } from "./record-presentation";
import { invalidRecordQueryPart } from "./record-query-validation";
import { recordColumns } from "./record-columns";
import { liveGroupSummaries, resolveRecordGrouping } from "./record-grouping";

export function recordViewStateIsValid(typeId: string, state: DataViewState, model: RecordModel): boolean {
  if (!model.types.some((type) => type.id === typeId && !type.archived)) return false;
  const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
  const paths = model.types.find((type) => type.id === typeId)?.relationshipPaths;
  const ids = new Set(recordColumns(typeId, model).map((column) => column.id));
  if (
    [...(state.columnOrder ?? []), ...(state.hiddenColumns ?? [])].some((id) => !ids.has(id)) ||
    Object.keys(state.columnWidths ?? {}).some((id) => !isPersistedColumnWidthKey(id, ids))
  )
    return false;
  if (state.grouping && !resolveRecordGrouping(typeId, state.grouping, model)) return false;
  if (
    state.grouping?.summaries &&
    liveGroupSummaries(typeId, state.grouping.summaries, fields).length !== state.grouping.summaries.length
  )
    return false;
  if (!presentationFiltersAreValid(state.filters ?? [], fields, model.relationships, typeId, paths)) return false;
  try {
    const query = presentationQuery(
      typeId,
      fields,
      { ...state, sortDescriptor: state.sortDescriptor ?? undefined },
      model.relationships,
      paths,
    );
    return !invalidRecordQueryPart(query, model);
  } catch {
    return false;
  }
}

function hasMultipleValues(filter: Filter): filter is Extract<Filter, { value: string[] }> {
  return "value" in filter && Array.isArray(filter.value);
}

function withoutStaleOptions(filter: Filter, fields: RecordField[]): Filter | null {
  const field = fields.find((candidate) => candidate.id === filter.field);
  if (field?.valueType !== "select" || !hasMultipleValues(filter)) return filter;
  const value = filter.value.filter((optionId) => field.options.some((option) => option.id === optionId));
  if (value.length === filter.value.length) return filter;
  return value.length ? { ...filter, value } : null;
}

export function liveRecordFilters(
  typeId: string,
  filters: Filter[],
  model: RecordModel,
  relationships: RecordRelationship[] = model.relationships,
  paths: RecordRelationshipPath[] | undefined = model.types.find((type) => type.id === typeId)?.relationshipPaths,
): Filter[] {
  const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
  return filters.flatMap((filter) => {
    const live = withoutStaleOptions(filter, fields);
    if (!live) return [];
    try {
      const query = presentationQuery(typeId, fields, { filters: [live] }, relationships, paths);
      return invalidRecordQueryPart(query, model) ? [] : [live];
    } catch {
      return [];
    }
  });
}

export function changedFilterCount(before: Filter[] = [], after: Filter[] = []): number {
  return before.filter((filter) => !after.some((kept) => equal(kept, filter))).length;
}

function staleOptionLabels(filter: Filter, model: RecordModel, labels: RecordModel): string[] {
  const field = model.fields.find((candidate) => candidate.id === filter.field);
  if (field?.valueType !== "select" || !hasMultipleValues(filter)) return [];
  const options = labels.fields.find((candidate) => candidate.id === filter.field)?.options ?? [];
  return filter.value.flatMap((optionId) => {
    if (field.options.some((option) => option.id === optionId)) return [];
    const label = options.find((option) => option.id === optionId)?.label;
    return label ? [label] : [];
  });
}

function staleColumnCleanup(state: DataViewState, ids: Set<string>): DataViewState {
  const cleaned: DataViewState = {};
  if (state.columnOrder?.some((id) => !ids.has(id)))
    cleaned.columnOrder = state.columnOrder.filter((id) => ids.has(id));
  if (state.hiddenColumns?.some((id) => !ids.has(id)))
    cleaned.hiddenColumns = state.hiddenColumns.filter((id) => ids.has(id));
  if (state.columnWidths && Object.keys(state.columnWidths).some((id) => !isPersistedColumnWidthKey(id, ids))) {
    cleaned.columnWidths = Object.fromEntries(
      Object.entries(state.columnWidths).filter(([id]) => isPersistedColumnWidthKey(id, ids)),
    );
  }
  return cleaned;
}

export function pruneStaleRecordViewColumns(
  typeId: string,
  state: DataViewState,
  model: RecordModel,
): DataViewState | null {
  if (!model.types.some((type) => type.id === typeId && !type.archived)) return null;
  const cleaned = staleColumnCleanup(state, new Set(recordColumns(typeId, model).map((column) => column.id)));
  return Object.keys(cleaned).length && recordViewStateIsValid(typeId, { ...state, ...cleaned }, model)
    ? cleaned
    : null;
}

export function invalidRecordViewReference(
  typeId: string,
  state: DataViewState,
  model: RecordModel,
  labels: RecordModel,
): { columnId: string; columnLabel: string } | null {
  const ids = new Set(recordColumns(typeId, model).map((column) => column.id));
  const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
  const filter = state.filters?.find((candidate) => !equal(liveRecordFilters(typeId, [candidate], model), [candidate]));
  const columnId =
    [...(state.columnOrder ?? []), ...(state.hiddenColumns ?? [])].find((id) => !ids.has(id)) ??
    Object.keys(state.columnWidths ?? {}).find((id) => !isPersistedColumnWidthKey(id, ids)) ??
    (state.grouping && !resolveRecordGrouping(typeId, state.grouping, model) ? state.grouping.field : undefined) ??
    state.grouping?.summaries?.find((summary) => !liveGroupSummaries(typeId, [summary], fields).length)?.fieldId ??
    filter?.field ??
    state.sortDescriptor?.field;
  if (!columnId) return null;
  const options = filter?.field === columnId ? staleOptionLabels(filter, model, labels) : [];
  const label = options.length
    ? options.join(", ")
    : ([...recordColumns(typeId, labels), ...recordColumns(typeId, model)].find((column) => column.id === columnId)
        ?.label ?? labels.fields.find((field) => field.id === columnId)?.label);
  return { columnId, columnLabel: label ?? columnId };
}

export function cleanRecordViewState(typeId: string, state: DataViewState, model: RecordModel): DataViewState | null {
  if (!model.types.some((type) => type.id === typeId && !type.archived)) return null;
  const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
  const cleaned = staleColumnCleanup(state, new Set(recordColumns(typeId, model).map((column) => column.id)));
  if (state.grouping && !resolveRecordGrouping(typeId, state.grouping, model)) cleaned.grouping = null;
  else if (state.grouping?.summaries) {
    const summaries = liveGroupSummaries(typeId, state.grouping.summaries, fields);
    if (summaries.length !== state.grouping.summaries.length) cleaned.grouping = { ...state.grouping, summaries };
  }
  const filters = state.filters && liveRecordFilters(typeId, state.filters, model);
  if (filters && changedFilterCount(state.filters, filters)) cleaned.filters = filters;
  if (!recordViewStateIsValid(typeId, { ...state, ...cleaned }, model)) cleaned.sortDescriptor = null;
  return Object.keys(cleaned).length && recordViewStateIsValid(typeId, { ...state, ...cleaned }, model)
    ? cleaned
    : null;
}
