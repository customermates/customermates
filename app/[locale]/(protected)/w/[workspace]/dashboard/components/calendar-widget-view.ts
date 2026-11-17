import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { CalendarWidgetData, CalendarWidgetItem } from "@/features/widget/record-calendar-widget.schema";

import type { CSSProperties } from "react";

import { getChartColors, getChartTextColors } from "@/constants/chart-colors";
import { calendarDateParts, calendarDayDifference, calendarMonthWeeks } from "@/features/record-calendar/calendar-date";
import { ChartColor } from "@/features/widget/widget-display.schema";

export const CALENDAR_HEAT_LEVELS = [0, 1, 2, 3] as const;
export type CalendarHeatLevel = (typeof CALENDAR_HEAT_LEVELS)[number];
const CALENDAR_HEAT_STEPS = CALENDAR_HEAT_LEVELS.length - 1;

export const CALENDAR_HEAT_EMPTY_CLASS = "bg-muted text-muted-foreground";

export function calendarHeatStyle(level: CalendarHeatLevel, accent: ChartColor): CSSProperties | undefined {
  if (level === 0) return undefined;
  const hue = accent.replace(/\d$/u, "");
  const shade = `${hue}${CALENDAR_HEAT_STEPS + 1 - level}` as ChartColor;
  const fill = getChartColors()[shade] ?? getChartColors()[ChartColor.primary1];
  return {
    backgroundColor: fill,
    color: level === CALENDAR_HEAT_STEPS ? "var(--background)" : getChartTextColors()[shade],
  };
}

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
  const magnitudes = days
    .map((day) => ({ day, magnitude: calendarDayMagnitude(day, aggregation) }))
    .filter(({ day, magnitude }) => (day.count ?? 0) > 0 || magnitude > 0);
  const distinct = [...new Set(magnitudes.map(({ magnitude }) => magnitude))].sort((a, b) => a - b);
  const levels = new Map<CalendarDate, CalendarHeatLevel>();
  for (const { day, magnitude } of magnitudes) {
    const level =
      distinct.length === 1
        ? aggregation === "count"
          ? Math.round(magnitude)
          : Math.ceil(CALENDAR_HEAT_STEPS / 2)
        : distinct.length === 2
          ? magnitude === distinct[0]
            ? 1
            : CALENDAR_HEAT_STEPS
          : Math.ceil(((distinct.indexOf(magnitude) + 1) / distinct.length) * CALENDAR_HEAT_STEPS);
    levels.set(day.date, Math.min(CALENDAR_HEAT_STEPS, Math.max(1, level)) as CalendarHeatLevel);
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
