import type { CalendarDate } from "./calendar-date";
import type { CalendarFields } from "./record-calendar-query";
import type { CalculatedValue, RecordField, RecordScalarInput } from "@/features/records/record-model.schema";

import { addCalendarDays, calendarDayDifference, compareCalendarDates, isCalendarDate } from "./calendar-date";
import { moveInstantToDate, zonedDate } from "./zoned-time";

type CalendarFieldShape = Pick<RecordField, "id" | "typeId" | "valueType" | "multiple" | "archived">;
type CalendarRecord = { id: string; fields: Array<{ fieldId: string; result: CalculatedValue }> };

export type CalendarEntry = {
  id: string;
  start: CalendarDate;
  end: CalendarDate;
  time: string | null;
  color: string | null;
};

function result(record: CalendarRecord, fieldId: string | undefined): CalculatedValue | undefined {
  return fieldId ? record.fields.find((field) => field.fieldId === fieldId)?.result : undefined;
}

function dayOf(value: string, timeZone: string): CalendarDate {
  return isCalendarDate(value) ? value : zonedDate(value, timeZone);
}

function endDayOf(value: string, startInstant: string | null, timeZone: string): CalendarDate {
  if (isCalendarDate(value)) return value;
  const end = new Date(value).getTime();
  const start = startInstant ? new Date(startInstant).getTime() : Number.NEGATIVE_INFINITY;
  return zonedDate(new Date(end > start ? end - 1 : end), timeZone);
}

function laterOf(start: CalendarDate, end: CalendarDate): CalendarDate {
  return compareCalendarDates(end, start) < 0 ? start : end;
}

export function calendarEntry(
  record: CalendarRecord,
  fields: CalendarFields<CalendarFieldShape>,
  timeZone: string,
): CalendarEntry | null {
  const value = result(record, fields.start.id);
  if (value?.state !== "value") return null;
  const colorValue = result(record, fields.color?.id);
  const color = colorValue?.state === "value" && colorValue.value.kind === "select" ? colorValue.value.value : null;
  const scalar = value.value;
  if (scalar.kind === "range") {
    const first = scalar.start ?? scalar.end;
    if (!first) return null;
    const timed = fields.start.valueType === "dateTimeRange";
    const start = dayOf(timed ? first : first.slice(0, 10), timeZone);
    const last = scalar.end ?? first;
    const end = timed ? endDayOf(last, scalar.start, timeZone) : last.slice(0, 10);
    return { id: record.id, start, end: laterOf(start, end), time: timed ? first : null, color };
  }
  if (scalar.kind !== "date" && scalar.kind !== "dateTime") return null;
  const start = scalar.kind === "date" ? scalar.value : zonedDate(scalar.value, timeZone);
  const time = scalar.kind === "dateTime" ? scalar.value : null;
  const endValue = result(record, fields.end?.id);
  const endScalar = endValue?.state === "value" ? endValue.value : null;
  const end =
    endScalar?.kind === "date"
      ? endScalar.value
      : endScalar?.kind === "dateTime"
        ? endDayOf(endScalar.value, time, timeZone)
        : start;
  return { id: record.id, start, end: laterOf(start, end), time, color };
}

export function calendarEntryCovers(entry: CalendarEntry, date: CalendarDate): boolean {
  return compareCalendarDates(entry.start, date) <= 0 && compareCalendarDates(date, entry.end) <= 0;
}

export function compareCalendarEntries(left: CalendarEntry, right: CalendarEntry): number {
  return (
    compareCalendarDates(left.start, right.start) ||
    calendarDayDifference(right.start, right.end) - calendarDayDifference(left.start, left.end) ||
    (left.time === null ? -1 : 0) - (right.time === null ? -1 : 0) ||
    (left.time && right.time ? new Date(left.time).getTime() - new Date(right.time).getTime() : 0)
  );
}

export function calendarMoveChanges(
  record: CalendarRecord,
  fields: CalendarFields<CalendarFieldShape>,
  target: CalendarDate,
  timeZone: string,
): Array<{ fieldId: string; value: RecordScalarInput }> | null {
  const entry = calendarEntry(record, fields, timeZone);
  const value = result(record, fields.start.id);
  if (!entry || value?.state !== "value") return null;
  const days = calendarDayDifference(entry.start, target);
  if (days === 0) return [];
  const shiftDate = (date: string) => addCalendarDays(date.slice(0, 10), days);
  const shiftInstant = (instant: string) =>
    moveInstantToDate(instant, addCalendarDays(zonedDate(instant, timeZone), days), timeZone);
  const scalar = value.value;
  const changes: Array<{ fieldId: string; value: RecordScalarInput }> = [];
  if (scalar.kind === "range") {
    const shift = fields.start.valueType === "dateTimeRange" ? shiftInstant : shiftDate;
    changes.push({
      fieldId: fields.start.id,
      value: {
        kind: "range",
        start: scalar.start === null ? null : shift(scalar.start),
        end: scalar.end === null ? null : shift(scalar.end),
      },
    });
    return changes;
  }
  if (scalar.kind === "date") changes.push({ fieldId: fields.start.id, value: { kind: "date", value: target } });
  else if (scalar.kind === "dateTime")
    changes.push({ fieldId: fields.start.id, value: { kind: "dateTime", value: shiftInstant(scalar.value) } });
  else return null;
  const end = result(record, fields.end?.id);
  if (fields.end && end?.state === "value") {
    if (end.value.kind === "date")
      changes.push({ fieldId: fields.end.id, value: { kind: "date", value: shiftDate(end.value.value) } });
    else if (end.value.kind === "dateTime")
      changes.push({ fieldId: fields.end.id, value: { kind: "dateTime", value: shiftInstant(end.value.value) } });
  }
  return changes;
}
