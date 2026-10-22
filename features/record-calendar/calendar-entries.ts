import type { CalendarDate } from "./calendar-date";
import type { CalendarFields } from "./record-calendar-query";
import type {
  CalculatedValue,
  RecordField,
  RecordScalar,
  RecordScalarInput,
} from "@/features/records/record-model.schema";

import { addCalendarDays, calendarDayDifference, compareCalendarDates, isCalendarDate } from "./calendar-date";
import { formatZonedInstant, moveInstantToDate, zonedDate, zonedDayStartText, zonedInstant } from "./zoned-time";

type CalendarFieldShape = Pick<RecordField, "id" | "typeId" | "valueType" | "multiple" | "archived">;
type CalendarRecord = { id: string; fields: Array<{ fieldId: string; result: CalculatedValue }> };

export type CalendarEntry = {
  id: string;
  start: CalendarDate;
  end: CalendarDate;
  time: string | null;
  endTime?: string | null;
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
    return {
      id: record.id,
      start,
      end: laterOf(start, end),
      time: timed ? first : null,
      ...(timed && scalar.end ? { endTime: scalar.end } : {}),
      color,
    };
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
  return {
    id: record.id,
    start,
    end: laterOf(start, end),
    time,
    ...(endScalar?.kind === "dateTime" ? { endTime: endScalar.value } : {}),
    color,
  };
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

export type CalendarEdge = "move" | "start" | "end";

export type CalendarEdit = { edge: CalendarEdge; days: number; minutes: number };

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const MIN_TIMED_MS = 15 * MINUTE_MS;
const DEFAULT_START_MINUTES = 9 * 60;

function shiftInstant(instant: string, days: number, minutes: number, timeZone: string): string {
  const moved = days
    ? moveInstantToDate(instant, addCalendarDays(zonedDate(instant, timeZone), days), timeZone)
    : instant;
  return minutes ? formatZonedInstant(new Date(new Date(moved).getTime() + minutes * MINUTE_MS), timeZone) : moved;
}

export function clampCalendarEdit(entry: CalendarEntry, edit: CalendarEdit): CalendarEdit {
  if (edit.edge === "move") return edit;
  const sign = edit.edge === "start" ? 1 : -1;
  if (entry.time && entry.endTime) {
    const room = new Date(entry.endTime).getTime() - new Date(entry.time).getTime() - MIN_TIMED_MS;
    const shift = edit.days * DAY_MS + edit.minutes * MINUTE_MS;
    if (sign * shift <= room) return edit;
    return { edge: edit.edge, days: 0, minutes: (sign * Math.max(0, room)) / MINUTE_MS };
  }
  const room = calendarDayDifference(entry.start, entry.end);
  return sign * edit.days <= room ? { ...edit, minutes: 0 } : { edge: edit.edge, days: sign * room, minutes: 0 };
}

export function editCalendarEntry(
  entry: CalendarEntry,
  edit: CalendarEdit | undefined,
  timeZone: string,
): CalendarEntry {
  if (!edit) return entry;
  const { edge, days, minutes } = clampCalendarEdit(entry, edit);
  if (days === 0 && minutes === 0) return entry;
  const next = { ...entry };
  if (edge !== "end") {
    next.time = entry.time ? shiftInstant(entry.time, days, minutes, timeZone) : null;
    next.start = next.time ? zonedDate(next.time, timeZone) : addCalendarDays(entry.start, days);
  }
  if (edge !== "start") {
    if (entry.endTime) next.endTime = shiftInstant(entry.endTime, days, minutes, timeZone);
    next.end = next.endTime
      ? endDayOf(next.endTime, next.time, timeZone)
      : edge === "move"
        ? addCalendarDays(next.start, calendarDayDifference(entry.start, entry.end))
        : addCalendarDays(entry.end, days);
  }
  return { ...next, end: laterOf(next.start, next.end) };
}

export function calendarEntryResizable(fields: CalendarFields<CalendarFieldShape>): boolean {
  return Boolean(fields.end) || fields.start.valueType === "dateRange" || fields.start.valueType === "dateTimeRange";
}

export function calendarEditChanges(
  record: CalendarRecord,
  fields: CalendarFields<CalendarFieldShape>,
  edit: CalendarEdit,
  timeZone: string,
): Array<{ fieldId: string; value: RecordScalarInput }> | null {
  const entry = calendarEntry(record, fields, timeZone);
  const value = result(record, fields.start.id);
  if (!entry || value?.state !== "value") return null;
  if (edit.edge !== "move" && !calendarEntryResizable(fields)) return null;
  const { edge, days, minutes } = clampCalendarEdit(entry, edit);
  if (days === 0 && minutes === 0) return [];
  const shiftDate = (date: string) => addCalendarDays(date.slice(0, 10), days);
  const shift = (instant: string) => shiftInstant(instant, days, minutes, timeZone);
  const movesStart = edge !== "end";
  const movesEnd = edge !== "start";
  const scalar = value.value;
  if (scalar.kind === "range") {
    const move = fields.start.valueType === "dateTimeRange" ? shift : shiftDate;
    const first = scalar.start ?? scalar.end;
    const last = scalar.end ?? scalar.start;
    return [
      {
        fieldId: fields.start.id,
        value: {
          kind: "range",
          start: movesStart
            ? edge === "move"
              ? scalar.start && move(scalar.start)
              : first && move(first)
            : scalar.start,
          end: movesEnd ? (edge === "move" ? scalar.end && move(scalar.end) : last && move(last)) : scalar.end,
        },
      },
    ];
  }
  if (scalar.kind !== "date" && scalar.kind !== "dateTime") return null;
  const changes: Array<{ fieldId: string; value: RecordScalarInput }> = [];
  if (movesStart) {
    changes.push({
      fieldId: fields.start.id,
      value:
        scalar.kind === "date"
          ? { kind: "date", value: shiftDate(scalar.value) }
          : { kind: "dateTime", value: shift(scalar.value) },
    });
  }
  const end = result(record, fields.end?.id);
  if (fields.end && movesEnd) {
    const current = end?.state === "value" ? end.value : null;
    if (current?.kind === "date")
      changes.push({ fieldId: fields.end.id, value: { kind: "date", value: shiftDate(current.value) } });
    else if (current?.kind === "dateTime")
      changes.push({ fieldId: fields.end.id, value: { kind: "dateTime", value: shift(current.value) } });
    else if (edge === "end") {
      changes.push({
        fieldId: fields.end.id,
        value:
          fields.end.valueType === "date"
            ? { kind: "date", value: shiftDate(entry.end) }
            : { kind: "dateTime", value: shift(entry.time ?? zonedDayStartText(entry.start, timeZone)) },
      });
    }
  }
  return changes;
}

export function calendarCreateValues(
  fields: CalendarFields<CalendarFieldShape>,
  date: CalendarDate,
  minutes: number | null,
  timeZone: string,
): Record<string, RecordScalar> {
  const at = (offset: number) => {
    const total = (minutes ?? DEFAULT_START_MINUTES) + offset;
    return formatZonedInstant(
      zonedInstant(date, { hour: Math.floor(total / 60), minute: total % 60, second: 0, millisecond: 0 }, timeZone),
      timeZone,
    );
  };
  const start = fields.start;
  if (start.valueType === "dateRange") return { [start.id]: { kind: "range", start: date, end: date } };
  if (start.valueType === "dateTimeRange") return { [start.id]: { kind: "range", start: at(0), end: at(60) } };
  const values: Record<string, RecordScalar> = {
    [start.id]: start.valueType === "date" ? { kind: "date", value: date } : { kind: "dateTime", value: at(0) },
  };
  if (fields.end) {
    values[fields.end.id] =
      fields.end.valueType === "date" ? { kind: "date", value: date } : { kind: "dateTime", value: at(60) };
  }
  return values;
}
