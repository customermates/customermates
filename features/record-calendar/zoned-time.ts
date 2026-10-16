import type { CalendarDate } from "./calendar-date";

import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

import { addCalendarDays, calendarDateOf, calendarDateParts } from "./calendar-date";

export type WallTime = { hour: number; minute: number; second: number; millisecond: number };
type ZonedParts = WallTime & { year: number; month: number; day: number };

const HOUR_MS = 3_600_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatters.set(timeZone, created);
  return created;
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Map(
    formatter(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.get(type) ?? 0;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
    millisecond: instant.getUTCMilliseconds(),
  };
}

function wallClock(parts: ZonedParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
}

export function zonedOffsetMinutes(instant: Date, timeZone: string): number {
  return Math.round((wallClock(zonedParts(instant, timeZone)) - instant.getTime()) / 60_000);
}

export function zonedDate(instant: Date | string, timeZone: string): CalendarDate {
  const parts = zonedParts(typeof instant === "string" ? new Date(instant) : instant, timeZone);
  return calendarDateOf(parts.year, parts.month, parts.day);
}

export function zonedWallTime(instant: Date | string, timeZone: string): WallTime {
  const { hour, minute, second, millisecond } = zonedParts(
    typeof instant === "string" ? new Date(instant) : instant,
    timeZone,
  );
  return { hour, minute, second, millisecond };
}

export function zonedInstant(date: CalendarDate, time: WallTime, timeZone: string): Date {
  const { year, month, day } = calendarDateParts(date);
  const local = Date.UTC(year, month - 1, day, time.hour, time.minute, time.second, time.millisecond);
  const before = zonedOffsetMinutes(new Date(local - 12 * HOUR_MS), timeZone);
  const after = zonedOffsetMinutes(new Date(local + 12 * HOUR_MS), timeZone);
  const candidates = [...new Set([local - before * 60_000, local - after * 60_000])].sort(
    (left, right) => left - right,
  );
  const exact = candidates.find((candidate) => wallClock(zonedParts(new Date(candidate), timeZone)) === local);
  return new Date(exact ?? local - before * 60_000);
}

export function zonedDayStart(date: CalendarDate, timeZone: string): Date {
  return zonedInstant(date, { hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone);
}

function offsetText(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function formatZonedInstant(instant: Date, timeZone: string, extraMicroseconds = ""): string {
  const parts = zonedParts(instant, timeZone);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const date = calendarDateOf(parts.year, parts.month, parts.day);
  const time = `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}.${pad(parts.millisecond, 3)}${extraMicroseconds}`;
  return `${date}T${time}${offsetText(zonedOffsetMinutes(instant, timeZone))}`;
}

export function zonedDayStartText(date: CalendarDate, timeZone: string): string {
  return formatZonedInstant(zonedDayStart(date, timeZone), timeZone);
}

export function zonedDayEndText(date: CalendarDate, timeZone: string): string {
  const next = zonedDayStart(addCalendarDays(date, 1), timeZone);
  return formatZonedInstant(new Date(next.getTime() - 1), timeZone, "999");
}

export function moveInstantToDate(instant: Date | string, date: CalendarDate, timeZone: string): string {
  return formatZonedInstant(zonedInstant(date, zonedWallTime(instant, timeZone), timeZone), timeZone);
}
