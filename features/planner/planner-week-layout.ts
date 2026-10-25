import type { PlannerEntry } from "./planner-entries";
import type { CalendarEntry } from "@/features/record-calendar/calendar-entries";

import { zonedParts } from "@/features/record-calendar/zoned-time";

const DAY_MS = 86_400_000;

function minute(instant: string, timeZone: string): number {
  const parts = zonedParts(new Date(instant), timeZone);
  return parts.hour * 60 + parts.minute;
}

export function showsInAllDayLane({ time, endTime }: Pick<CalendarEntry, "time" | "endTime">): boolean {
  if (!time) return true;
  return endTime ? new Date(endTime).getTime() - new Date(time).getTime() >= DAY_MS : false;
}

export type TimedPlannerPosition = { item: PlannerEntry; start: number; end: number; column: number; columns: number };
export function layoutPlannerDay(entries: PlannerEntry[], day: string, timeZone: string): TimedPlannerPosition[] {
  const positions: TimedPlannerPosition[] = entries
    .filter((item) => !showsInAllDayLane(item.entry) && item.entry.start <= day && item.entry.end >= day)
    .map((item) => {
      const start = item.entry.start < day ? 0 : minute(item.entry.time ?? "", timeZone);
      const end =
        item.entry.end > day ? 1440 : item.entry.endTime ? minute(item.entry.endTime, timeZone) || 1440 : start + 60;
      return { item, start, end: Math.min(1440, Math.max(start + 15, end)), column: 0, columns: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
  let cluster: TimedPlannerPosition[] = [];
  let columns: number[] = [];
  let clusterEnd = 0;
  const finish = () => {
    for (const item of cluster) item.columns = columns.length;
    cluster = [];
    columns = [];
  };
  for (const position of positions) {
    if (position.start >= clusterEnd) finish();
    let column = columns.findIndex((end) => end <= position.start);
    if (column < 0) column = columns.length;
    columns[column] = position.end;
    position.column = column;
    cluster.push(position);
    clusterEnd = Math.max(...columns);
  }
  finish();
  return positions;
}
