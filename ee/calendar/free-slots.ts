import { addCalendarDays, calendarWeekdayIndex } from "@/features/record-calendar/calendar-date";
import { zonedDate, zonedInstant } from "@/features/record-calendar/zoned-time";

import { timeOfDayMinutes, workingWindowsOn, type WorkingHours } from "./working-hours";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export type BusyInterval = { startsAt: Date; endsAt: Date };

export type FreeSlotRules = {
  workingHours: WorkingHours;
  timeZone: string;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  horizonDays: number;
  stepMinutes: number;
};

export type FreeSlot = { startsAt: string; endsAt: string };

export type FreeSlotQuery = {
  rules: FreeSlotRules;
  now: Date;
  busy: BusyInterval[];
  from?: Date;
  to?: Date;
  limit?: number;
};

function wallTime(minutes: number) {
  return { hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0, millisecond: 0 };
}

function overlaps(busy: BusyInterval[], start: number, end: number): boolean {
  return busy.some((interval) => interval.startsAt.getTime() < end && interval.endsAt.getTime() > start);
}

export function freeSlotWindow(rules: FreeSlotRules, now: Date): { earliest: Date; latest: Date } {
  return {
    earliest: new Date(now.getTime() + rules.minNoticeMinutes * MINUTE_MS),
    latest: new Date(now.getTime() + rules.horizonDays * DAY_MS),
  };
}

export function computeFreeSlots({ rules, now, busy, from, to, limit = 500 }: FreeSlotQuery): FreeSlot[] {
  const bounds = freeSlotWindow(rules, now);
  const earliest = from && from > bounds.earliest ? from : bounds.earliest;
  const latest = to && to < bounds.latest ? to : bounds.latest;
  if (earliest >= latest) return [];

  const durationMs = rules.durationMinutes * MINUTE_MS;
  const bufferMs = rules.bufferMinutes * MINUTE_MS;
  const stepMs = Math.max(1, rules.stepMinutes) * MINUTE_MS;
  const slots: FreeSlot[] = [];
  const lastDay = zonedDate(latest, rules.timeZone);

  for (let day = zonedDate(earliest, rules.timeZone); day <= lastDay; day = addCalendarDays(day, 1)) {
    for (const window of workingWindowsOn(rules.workingHours, calendarWeekdayIndex(day))) {
      const windowStart = zonedInstant(day, wallTime(timeOfDayMinutes(window.start)), rules.timeZone).getTime();
      const windowEnd = zonedInstant(day, wallTime(timeOfDayMinutes(window.end)), rules.timeZone).getTime();
      for (let start = windowStart; start + durationMs <= windowEnd; start += stepMs) {
        if (start < earliest.getTime() || start > latest.getTime()) continue;
        if (overlaps(busy, start - bufferMs, start + durationMs + bufferMs)) continue;
        slots.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(start + durationMs).toISOString() });
        if (slots.length >= limit) return slots;
      }
    }
  }
  return slots;
}

export function isFreeSlot(query: Omit<FreeSlotQuery, "from" | "to" | "limit">, startsAt: Date): boolean {
  const key = startsAt.toISOString();
  const day = Math.floor(startsAt.getTime() / DAY_MS) * DAY_MS;
  return computeFreeSlots({
    ...query,
    from: new Date(day - DAY_MS),
    to: new Date(day + 2 * DAY_MS),
    limit: 2000,
  }).some((slot) => slot.startsAt === key);
}
