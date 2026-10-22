import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { CalendarEntry } from "@/features/record-calendar/calendar-entries";
import type { CalendarFields } from "@/features/record-calendar/record-calendar-query";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import type { ChipColor } from "@/constants/chip-colors";
import type { CSSProperties } from "react";

import { toChipColor } from "@/constants/chip-colors";
import { moveInstantToDate, zonedDate } from "@/features/record-calendar/zoned-time";
import {
  addCalendarDays,
  calendarDatesBetween,
  calendarDayDifference,
  compareCalendarDates,
} from "@/features/record-calendar/calendar-date";
import {
  calendarEntry,
  calendarEntryCovers,
  compareCalendarEntries,
} from "@/features/record-calendar/calendar-entries";

export type CalendarItem = { entry: CalendarEntry; record: RecordRow };

export type CalendarSegment = {
  item: CalendarItem;
  start: CalendarDate;
  end: CalendarDate;
  column: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export type CalendarWeekLayout = {
  days: CalendarDate[];
  segments: CalendarSegment[];
  lanes: number;
};

export const CALENDAR_MONTH_LANES = 3;

function laterOf(left: CalendarDate, right: CalendarDate) {
  return compareCalendarDates(left, right) < 0 ? right : left;
}

function earlierOf(left: CalendarDate, right: CalendarDate) {
  return compareCalendarDates(left, right) < 0 ? left : right;
}

export function shiftCalendarEntry(entry: CalendarEntry, days: number, timeZone = "UTC"): CalendarEntry {
  if (days === 0) return entry;
  const shift = (instant: string) =>
    moveInstantToDate(instant, addCalendarDays(zonedDate(instant, timeZone), days), timeZone);
  return {
    ...entry,
    start: addCalendarDays(entry.start, days),
    end: addCalendarDays(entry.end, days),
    time: entry.time ? shift(entry.time) : null,
    ...(entry.endTime ? { endTime: shift(entry.endTime) } : {}),
  };
}

export function calendarItems(
  records: readonly RecordRow[],
  fields: CalendarFields<RecordFieldView>,
  timeZone: string,
  pendingShifts: ReadonlyMap<string, number> = new Map(),
): CalendarItem[] {
  return records
    .flatMap((record) => {
      const entry = calendarEntry(record, fields, timeZone);
      return entry ? [{ entry: shiftCalendarEntry(entry, pendingShifts.get(record.id) ?? 0, timeZone), record }] : [];
    })
    .sort((left, right) => compareCalendarEntries(left.entry, right.entry));
}

export function layoutCalendarWeek(items: readonly CalendarItem[], days: CalendarDate[]): CalendarWeekLayout {
  const first = days[0];
  const last = days[days.length - 1];
  const laneEnds: CalendarDate[] = [];
  const segments: CalendarSegment[] = [];
  for (const item of items) {
    const { entry } = item;
    if (compareCalendarDates(entry.end, first) < 0 || compareCalendarDates(entry.start, last) > 0) continue;
    const start = laterOf(entry.start, first);
    const end = earlierOf(entry.end, last);
    let lane = laneEnds.findIndex((laneEnd) => compareCalendarDates(laneEnd, start) < 0);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = end;
    segments.push({
      item,
      start,
      end,
      column: calendarDayDifference(first, start),
      span: calendarDayDifference(start, end) + 1,
      lane,
      continuesBefore: compareCalendarDates(entry.start, start) < 0,
      continuesAfter: compareCalendarDates(entry.end, end) > 0,
    });
  }
  return { days, segments, lanes: laneEnds.length };
}

export function calendarItemsOn(items: readonly CalendarItem[], date: CalendarDate): CalendarItem[] {
  return items.filter((item) => calendarEntryCovers(item.entry, date));
}

export function hiddenCalendarItemsOn(layout: CalendarWeekLayout, date: CalendarDate, visibleLanes: number): number {
  return layout.segments.filter(
    (segment) =>
      segment.lane >= visibleLanes &&
      compareCalendarDates(segment.start, date) <= 0 &&
      compareCalendarDates(date, segment.end) <= 0,
  ).length;
}

export function calendarAgendaDays(
  items: readonly CalendarItem[],
  from: CalendarDate,
  to: CalendarDate,
): Array<{ date: CalendarDate; items: CalendarItem[] }> {
  return calendarDatesBetween(from, to).flatMap((date) => {
    const dayItems = calendarItemsOn(items, date);
    return dayItems.length ? [{ date, items: dayItems }] : [];
  });
}

export function calendarEntryColor(
  entry: CalendarEntry,
  colorField: Pick<RecordFieldView, "options"> | null,
): ChipColor {
  if (!colorField) return "default";
  const option = entry.color ? colorField.options.find((candidate) => candidate.id === entry.color) : undefined;
  return option ? toChipColor(option.color) : "secondary";
}

const CHIP_TOKENS: Record<ChipColor, { color: string; tint: number; text: number }> = {
  default: { color: "var(--primary)", tint: 20, text: 100 },
  secondary: { color: "var(--foreground)", tint: 5, text: 80 },
  destructive: { color: "var(--destructive)", tint: 20, text: 100 },
  success: { color: "var(--success)", tint: 20, text: 100 },
  warning: { color: "var(--warning)", tint: 20, text: 100 },
  info: { color: "var(--info)", tint: 20, text: 100 },
};

function chipMix(color: string, percent: number) {
  return percent === 100 ? color : `color-mix(in oklab, ${color} ${percent}%, var(--background))`;
}

export function calendarEntryColorStyle(color: ChipColor): CSSProperties {
  const token = CHIP_TOKENS[color];
  return { backgroundColor: chipMix(token.color, token.tint), color: chipMix(token.color, token.text) };
}

export function calendarSwatchStyle(color: ChipColor): CSSProperties {
  return { backgroundColor: CHIP_TOKENS[color].color };
}

export function calendarMoveTarget(item: CalendarItem, grabDate: CalendarDate, dropDate: CalendarDate) {
  return addCalendarDays(item.entry.start, calendarDayDifference(grabDate, dropDate));
}
