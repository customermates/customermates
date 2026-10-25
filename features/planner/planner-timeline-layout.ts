import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { CalendarEntry } from "@/features/record-calendar/calendar-entries";

import { calendarDayDifference } from "@/features/record-calendar/calendar-date";

export const TIMELINE_LABEL_GAP = 6;
const LANE_GAP = 4;
const LABEL_PADDING = 16;
const CHARACTER_WIDTH = 6.5;
const MAX_LABEL_WIDTH = 240;

export type TimelineSpan = {
  start: CalendarDate;
  end: CalendarDate;
  offset: number;
  span: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export type TimelineBar<T> = TimelineSpan & { item: T; lane: number; labelInside: boolean };

export function timelineLabelWidth(label: string): number {
  return Math.min(MAX_LABEL_WIDTH, Math.ceil(label.length * CHARACTER_WIDTH));
}

export function timelineSpan(
  entry: Pick<CalendarEntry, "start" | "end">,
  from: CalendarDate,
  to: CalendarDate,
): TimelineSpan | null {
  if (entry.end < from || entry.start > to) return null;
  const start = entry.start < from ? from : entry.start;
  const end = entry.end > to ? to : entry.end;
  return {
    start,
    end,
    offset: calendarDayDifference(from, start),
    span: calendarDayDifference(start, end) + 1,
    continuesBefore: entry.start < from,
    continuesAfter: entry.end > to,
  };
}

export function timelineLabelInside(span: number, dayWidth: number, label: string): boolean {
  return timelineLabelWidth(label) + LABEL_PADDING <= span * dayWidth;
}

export function layoutPlannerTimeline<T>(
  items: readonly T[],
  {
    entry,
    label,
    from,
    to,
    dayWidth,
  }: {
    entry: (item: T) => Pick<CalendarEntry, "start" | "end">;
    label: (item: T) => string;
    from: CalendarDate;
    to: CalendarDate;
    dayWidth: number;
  },
): { bars: TimelineBar<T>[]; lanes: number } {
  const laneEnds: number[] = [];
  const bars: TimelineBar<T>[] = [];
  for (const item of items) {
    const span = timelineSpan(entry(item), from, to);
    if (!span) continue;
    const text = label(item);
    const labelInside = timelineLabelInside(span.span, dayWidth, text);
    const left = span.offset * dayWidth;
    const right = left + span.span * dayWidth + (labelInside ? 0 : TIMELINE_LABEL_GAP + timelineLabelWidth(text));
    let lane = laneEnds.findIndex((end) => end + LANE_GAP <= left);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = right;
    bars.push({ ...span, item, lane, labelInside });
  }
  return { bars, lanes: laneEnds.length };
}
