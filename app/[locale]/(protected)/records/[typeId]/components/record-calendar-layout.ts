import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { CalendarEntry } from "@/features/record-calendar/calendar-entries";
import type { CalendarFields } from "@/features/record-calendar/record-calendar-query";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordFieldView } from "@/features/records/record-model.schema";
import type { ChipColor } from "@/constants/chip-colors";

import { toChipColor } from "@/constants/chip-colors";
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

export const CALENDAR_KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

function laterOf(left: CalendarDate, right: CalendarDate) {
  return compareCalendarDates(left, right) < 0 ? right : left;
}

function earlierOf(left: CalendarDate, right: CalendarDate) {
  return compareCalendarDates(left, right) < 0 ? left : right;
}

export function shiftCalendarEntry(entry: CalendarEntry, days: number): CalendarEntry {
  if (days === 0) return entry;
  return { ...entry, start: addCalendarDays(entry.start, days), end: addCalendarDays(entry.end, days) };
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
      return entry ? [{ entry: shiftCalendarEntry(entry, pendingShifts.get(record.id) ?? 0), record }] : [];
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

export const CALENDAR_ENTRY_COLOR_CLASS: Record<ChipColor, string> = {
  default: "bg-primary/15 text-primary hover:bg-primary/25",
  secondary: "bg-foreground/5 text-foreground/80 hover:bg-foreground/10",
  destructive: "bg-destructive/15 text-destructive hover:bg-destructive/25",
  success: "bg-success/15 text-success hover:bg-success/25",
  warning: "bg-warning/15 text-warning hover:bg-warning/25",
  info: "bg-info/15 text-info hover:bg-info/25",
};

export function calendarMoveTarget(segment: Pick<CalendarSegment, "item" | "start">, dropDate: CalendarDate) {
  return addCalendarDays(segment.item.entry.start, calendarDayDifference(segment.start, dropDate));
}
