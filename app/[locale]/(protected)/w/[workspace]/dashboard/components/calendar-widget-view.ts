import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { CalendarWidgetData, CalendarWidgetItem } from "@/features/widget/record-calendar-widget.schema";

import { calendarDateParts, calendarDayDifference, calendarMonthWeeks } from "@/features/record-calendar/calendar-date";

export const CALENDAR_HEAT_LEVELS = [0, 1, 2, 3, 4] as const;
export type CalendarHeatLevel = (typeof CALENDAR_HEAT_LEVELS)[number];

export const CALENDAR_HEAT_CLASS: Record<CalendarHeatLevel, string> = {
  0: "bg-muted text-muted-foreground",
  1: "bg-chart-1/16 text-foreground",
  2: "bg-chart-1/36 text-foreground",
  3: "bg-chart-1/62 text-foreground",
  4: "bg-chart-1 text-primary-foreground",
};

type CalendarDay = CalendarWidgetData["days"][number];

function calendarDayMagnitude(day: CalendarDay, aggregation: "count" | "sum"): number {
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

export function calendarMonthGrid(anchor: CalendarDate): Array<Array<CalendarDate | null>> {
  const month = calendarDateParts(anchor).month;
  return calendarMonthWeeks(anchor).map((week) =>
    week.map((date) => (calendarDateParts(date).month === month ? date : null)),
  );
}

export function calendarWidgetEntry(item: CalendarWidgetItem) {
  const time = item.value.state === "value" && item.value.value.kind === "dateTime" ? item.value.value.value : null;
  return { start: item.date, end: item.date, time };
}

export function calendarMonthKey(date: CalendarDate): string {
  return date.slice(0, 7);
}
