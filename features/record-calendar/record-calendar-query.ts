import type { CalendarViewConfig, CalendarWindow } from "@/core/data-view/calendar-view-config.schema";
import type { RecordField, RecordScalar } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";

import { CALENDAR_DATE_VALUE_TYPES, CALENDAR_END_VALUE_TYPES } from "@/core/data-view/calendar-view-config.schema";

import { zonedDayEndText, zonedDayStartText } from "./zoned-time";

type RecordFilter = RecordQuery["filters"][number];
type CalendarFieldShape = Pick<RecordField, "id" | "typeId" | "valueType" | "multiple" | "archived">;

export type CalendarFields<F extends CalendarFieldShape = RecordField> = {
  start: F;
  end: F | null;
  color: F | null;
};

export function isCalendarDateField(field: Pick<RecordField, "valueType" | "multiple" | "archived">): boolean {
  return (
    !field.archived && !field.multiple && (CALENDAR_DATE_VALUE_TYPES as readonly string[]).includes(field.valueType)
  );
}

export function isCalendarEndField(
  field: Pick<RecordField, "valueType" | "multiple" | "archived">,
  start: Pick<RecordField, "valueType">,
): boolean {
  return (
    !field.archived &&
    !field.multiple &&
    field.valueType === start.valueType &&
    (CALENDAR_END_VALUE_TYPES as readonly string[]).includes(field.valueType)
  );
}

export function isCalendarColorField(field: Pick<RecordField, "valueType" | "multiple" | "archived">): boolean {
  return !field.archived && !field.multiple && field.valueType === "select";
}

export function isCalendarRangeField(field: Pick<RecordField, "valueType">): boolean {
  return field.valueType === "dateRange" || field.valueType === "dateTimeRange";
}

export function resolveCalendarFields<F extends CalendarFieldShape>(
  typeId: string,
  config: CalendarViewConfig,
  fields: F[],
): CalendarFields<F> | null {
  const find = (id: string | null | undefined) =>
    id ? fields.find((field) => field.id === id && field.typeId === typeId && !field.archived) : undefined;
  const start = find(config.dateFieldId);
  if (!start || !isCalendarDateField(start)) return null;
  const end = find(config.endDateFieldId);
  if (config.endDateFieldId && (!end || isCalendarRangeField(start) || !isCalendarEndField(end, start))) return null;
  const color = find(config.colorFieldId);
  if (config.colorFieldId && (!color || !isCalendarColorField(color))) return null;
  return { start, end: end ?? null, color: color ?? null };
}

export function windowEndpoints(
  field: Pick<RecordField, "valueType">,
  window: Pick<CalendarWindow, "from" | "to" | "timeZone">,
): [RecordScalar, RecordScalar] {
  if (field.valueType === "date" || field.valueType === "dateRange") {
    return [
      { kind: "date", value: window.from },
      { kind: "date", value: window.to },
    ];
  }
  return [
    { kind: "dateTime", value: zonedDayStartText(window.from, window.timeZone) },
    { kind: "dateTime", value: zonedDayEndText(window.to, window.timeZone) },
  ];
}

export function calendarWindowFilters(
  fields: CalendarFields<CalendarFieldShape>,
  window: CalendarWindow,
): { starting: RecordFilter[]; spanning: RecordFilter[] | null } {
  const [from, to] = windowEndpoints(fields.start, window);
  const starting: RecordFilter[] = [
    { fieldId: fields.start.id, operator: "overlaps", value: null, values: [from, to] },
  ];
  if (!fields.end) return { starting, spanning: null };
  return {
    starting,
    spanning: [
      { fieldId: fields.start.id, operator: "lt", value: from },
      { fieldId: fields.end.id, operator: fields.end.valueType === "dateTime" ? "gt" : "gte", value: from },
    ],
  };
}
