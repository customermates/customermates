import type { CalendarViewMode } from "@/core/data-view/calendar-view-config.schema";
import type { CalendarDate } from "./calendar-date";

import {
  addCalendarDays,
  addCalendarMonths,
  endOfCalendarMonth,
  endOfCalendarWeek,
  startOfCalendarMonth,
  startOfCalendarQuarter,
  startOfCalendarWeek,
} from "./calendar-date";

export type CalendarWindowMode = CalendarViewMode | "quarter";

export const CALENDAR_KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

export function calendarWindowRange(
  mode: CalendarWindowMode,
  anchor: CalendarDate,
): { from: CalendarDate; to: CalendarDate } {
  if (mode === "week") return { from: startOfCalendarWeek(anchor), to: endOfCalendarWeek(anchor) };
  if (mode === "agenda") return { from: startOfCalendarMonth(anchor), to: endOfCalendarMonth(anchor) };
  const first = mode === "quarter" ? startOfCalendarQuarter(anchor) : startOfCalendarMonth(anchor);
  const last = mode === "quarter" ? endOfCalendarMonth(addCalendarMonths(first, 2)) : endOfCalendarMonth(anchor);
  return { from: startOfCalendarWeek(first), to: endOfCalendarWeek(last) };
}

export function shiftCalendarAnchor(mode: CalendarWindowMode, anchor: CalendarDate, step: number): CalendarDate {
  if (mode === "week") return addCalendarDays(anchor, step * 7);
  return addCalendarMonths(anchor, mode === "quarter" ? step * 3 : step);
}
