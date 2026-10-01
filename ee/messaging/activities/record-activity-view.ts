import { z } from "zod";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import { RecordSurfaceKeySchema } from "@/core/data-view/data-view-identity.schema";
import { RecordActivityFilterSchema, type RecordActivityFilter } from "./record-activities.schema";

const SOURCES = {
  changes: ["audit"],
  messages: ["message"],
  activities: ["activity", "calendar_event"],
  audit: ["audit"],
  message: ["message"],
  activity: ["activity"],
  calendar_event: ["calendar_event"],
} as const;

export function activityViewFilters(filters: readonly Filter[]): RecordActivityFilter[] {
  if (filters.length > 20) throw new Error("Activity views support at most 20 filters");
  return filters.map((filter) => {
    const values = "value" in filter ? filter.value : [];
    const record = RecordSurfaceKeySchema.safeParse(filter.field);
    if (record.success) {
      return RecordActivityFilterSchema.parse({
        kind: "record",
        typeId: record.data.slice(8),
        operator: filter.operator,
        recordIds: values,
      });
    }
    if (filter.field === "timelineKind") {
      const sources = z.array(z.enum(Object.keys(SOURCES) as (keyof typeof SOURCES)[])).parse(values);
      return RecordActivityFilterSchema.parse({
        kind: "source",
        operator: filter.operator,
        values: [...new Set(sources.flatMap((source) => [...SOURCES[source]]))],
      });
    }
    const kind = { provider: "provider", connectedAccountId: "account", timelineThreadId: "thread" }[filter.field];
    return RecordActivityFilterSchema.parse({ kind, operator: filter.operator, values });
  });
}

export function activityViewStateValid(state: DataViewState) {
  if (
    state.searchTerm ||
    (state.sortDescriptor && (state.sortDescriptor.field !== "at" || state.sortDescriptor.direction !== "desc")) ||
    state.grouping ||
    state.columnOrder?.length ||
    state.hiddenColumns?.length ||
    Object.keys(state.columnWidths ?? {}).length ||
    (state.viewMode && state.viewMode !== ViewMode.table)
  )
    return false;
  try {
    activityViewFilters(state.filters ?? []);
    return true;
  } catch {
    return false;
  }
}

export function activityViewColumns(types: readonly { surfaceKey: string; label: string }[]): ColumnPresentation[] {
  return types.map((type) => ({
    id: type.surfaceKey,
    label: type.label,
    type: "recordReference",
    typeId: type.surfaceKey.slice(8),
  }));
}

export function activityViewFilterableFields(
  types: readonly { surfaceKey: string; label: string }[],
): FilterableField[] {
  const selections = [FilterOperatorKey.in, FilterOperatorKey.notIn];
  return [
    ...["timelineKind", "provider", "connectedAccountId", "timelineThreadId"].map((field) => ({
      field,
      operators: selections,
    })),
    ...types.map(({ surfaceKey, label }) => ({
      field: surfaceKey,
      label,
      operators: [...selections, FilterOperatorKey.hasSome, FilterOperatorKey.hasNone],
    })),
  ];
}
