import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { CalendarWidgetData, CalendarWidgetItem } from "@/features/widget/record-calendar-widget.schema";

import {
  addCalendarMonths,
  calendarDateParts,
  calendarDayDifference,
  calendarMonthWeeks,
  endOfCalendarMonth,
  startOfCalendarMonth,
} from "@/features/record-calendar/calendar-date";

export const CALENDAR_HEAT_LEVELS = [0, 1, 2, 3, 4] as const;
export type CalendarHeatLevel = (typeof CALENDAR_HEAT_LEVELS)[number];

export const CALENDAR_HEAT_CLASS: Record<CalendarHeatLevel, string> = {
  0: "bg-muted text-muted-foreground",
  1: "bg-[color-mix(in_oklab,var(--chart-1)_16%,transparent)] text-foreground",
  2: "bg-[color-mix(in_oklab,var(--chart-1)_36%,transparent)] text-foreground",
  3: "bg-[color-mix(in_oklab,var(--chart-1)_62%,transparent)] text-foreground",
  4: "bg-(--chart-1) text-primary-foreground",
};

type CalendarDay = CalendarWidgetData["days"][number];

export function calendarDayMagnitude(day: CalendarDay, aggregation: "count" | "sum"): number {
  if (aggregation === "count" && day.count !== null) return day.count;
  const result = day.result;
  if (result.state !== "value" || result.value.kind !== "decimal") return day.count ?? 0;
  const value = Number(result.value.value);
  return Number.isFinite(value) ? Math.abs(value) : 0;
}

export function calendarHeatLevels(
  days: CalendarDay[],
  aggregation: "count" | "sum",
): Map<CalendarDate, CalendarHeatLevel> {
  const magnitudes = days.map((day) => ({ day, magnitude: calendarDayMagnitude(day, aggregation) }));
  const largest = Math.max(0, ...magnitudes.map(({ magnitude }) => magnitude));
  const levels = new Map<CalendarDate, CalendarHeatLevel>();
  for (const { day, magnitude } of magnitudes) {
    const hasRecords = (day.count ?? 0) > 0 || magnitude > 0;
    if (!hasRecords) continue;
    const scaled = largest > 0 ? Math.ceil((magnitude / largest) * 4) : 1;
    levels.set(day.date, Math.min(4, Math.max(1, scaled)) as CalendarHeatLevel);
  }
  return levels;
}

export function calendarOverdueDays(date: CalendarDate, today: CalendarDate): number {
  return Math.max(1, calendarDayDifference(date, today));
}

export function calendarMonthWindow(anchor: CalendarDate): { from: CalendarDate; to: CalendarDate } {
  return { from: startOfCalendarMonth(anchor), to: endOfCalendarMonth(anchor) };
}

export function shiftCalendarMonth(anchor: CalendarDate, step: number): CalendarDate {
  return startOfCalendarMonth(addCalendarMonths(startOfCalendarMonth(anchor), step));
}

export function calendarMonthGrid(anchor: CalendarDate): Array<Array<CalendarDate | null>> {
  const month = calendarDateParts(anchor).month;
  return calendarMonthWeeks(anchor).map((week) =>
    week.map((date) => (calendarDateParts(date).month === month ? date : null)),
  );
}

export function calendarDayItems(items: CalendarWidgetItem[], date: CalendarDate): CalendarWidgetItem[] {
  return items.filter((item) => item.date === date);
}

export function calendarMonthKey(date: CalendarDate): string {
  return date.slice(0, 7);
}
