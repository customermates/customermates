import type { CalendarViewMode } from "@/core/data-view/calendar-view-config.schema";
import type { CalendarDate } from "./calendar-date";

import {
  addCalendarDays,
  addCalendarMonths,
  endOfCalendarMonth,
  endOfCalendarWeek,
  startOfCalendarMonth,
  startOfCalendarWeek,
} from "./calendar-date";

export function calendarWindowRange(
  mode: CalendarViewMode,
  anchor: CalendarDate,
): { from: CalendarDate; to: CalendarDate } {
  if (mode === "week") return { from: startOfCalendarWeek(anchor), to: endOfCalendarWeek(anchor) };
  if (mode === "agenda") return { from: startOfCalendarMonth(anchor), to: endOfCalendarMonth(anchor) };
  return {
    from: startOfCalendarWeek(startOfCalendarMonth(anchor)),
    to: endOfCalendarWeek(endOfCalendarMonth(anchor)),
  };
}

export function shiftCalendarAnchor(mode: CalendarViewMode, anchor: CalendarDate, step: number): CalendarDate {
  return mode === "week" ? addCalendarDays(anchor, step * 7) : addCalendarMonths(anchor, step);
}
