import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { RecordModelView } from "./record-model.schema";
import type { RecordQuery } from "./record-query.schema";

import { ViewMode } from "@/core/base/base-query-builder";
import { resolveCalendarFields } from "@/features/record-calendar/record-calendar-query";
import { recordColumns } from "./record-columns";
import { parseRelationshipColumnKey } from "./record-column.schema";

export function recordListProjection(
  typeId: string,
  model: RecordModelView,
  state: Pick<DataViewState, "hiddenColumns" | "viewMode" | "grouping" | "calendar">,
  columns?: string[],
): Required<Pick<RecordQuery, "fields" | "includeRelationships" | "includePaths" | "includeIdentities">> {
  const visible = recordColumns(typeId, model).filter((column) =>
    columns ? columns.includes(column.id) : !state.hiddenColumns?.includes(column.id),
  );
  const required = new Set(visible.filter((column) => column.kind === "field").map((column) => column.id));
  const primary = model.types.find((type) => type.id === typeId)?.primaryFieldId;
  if (primary) required.add(primary);
  const avatar = model.capabilities
    .find((binding) => binding.typeId === typeId && binding.kind === "avatar")
    ?.fields.find((field) => field.role === "image")?.fieldId;
  if (avatar) required.add(avatar);
  if (state.grouping) required.add(state.grouping.field);
  const calendar =
    state.viewMode === ViewMode.calendar && state.calendar
      ? resolveCalendarFields(typeId, state.calendar, model.fields)
      : null;
  for (const field of [calendar?.start, calendar?.end, calendar?.color]) if (field) required.add(field.id);

  return {
    fields: model.fields
      .filter(
        (field) =>
          field.typeId === typeId && !field.archived && field.valueType !== "channels" && required.has(field.id),
      )
      .map((field) => field.id),
    includeRelationships: visible.flatMap((column) => {
      const selection = column.kind === "relationship" ? parseRelationshipColumnKey(column.id) : null;
      return selection ? [{ ...selection, limit: 10 }] : [];
    }),
    includePaths: visible.flatMap((column) =>
      column.kind === "relationshipPath" ? [{ pathId: column.definition.id, limit: 10 }] : [],
    ),
    includeIdentities: visible.some((column) => column.kind === "field" && column.field.valueType === "channels"),
  };
}
