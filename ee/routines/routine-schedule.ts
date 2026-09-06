import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";

export const MIN_ROUTINE_INTERVAL_MINUTES = 15;
export const DEFAULT_ROUTINE_TIMEZONE = "UTC";

const MAX_SEARCH_DAYS = 400;
const INTERVAL_SAMPLE_COUNT = 12;

const FIELD_RANGES = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 7 },
} as const;

export type ParsedCron = {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
  dayOfMonthRestricted: boolean;
  dayOfWeekRestricted: boolean;
};

export type CronParseResult = { ok: true; cron: ParsedCron } | { ok: false; reason: CronParseFailure };

export type CronParseFailure = "fieldCount" | "fieldSyntax" | "fieldRange" | "stepValue" | "rangeOrder" | "unreachable";

function expandField(raw: string, range: { min: number; max: number }): number[] | CronParseFailure {
  const values = new Set<number>();

  for (const token of raw.split(",")) {
    if (token.length === 0) return "fieldSyntax";

    const [spec, stepRaw, ...rest] = token.split("/");
    if (rest.length > 0) return "fieldSyntax";

    let step = 1;
    if (stepRaw !== undefined) {
      if (!/^\d+$/.test(stepRaw)) return "fieldSyntax";
      step = Number(stepRaw);
      if (step < 1 || step > range.max - range.min + 1) return "stepValue";
    }

    let from = range.min;
    let to = range.max;

    if (spec !== "*") {
      const bounds = spec.split("-");
      if (bounds.length > 2) return "fieldSyntax";
      if (!bounds.every((bound) => /^\d+$/.test(bound))) return "fieldSyntax";

      from = Number(bounds[0]);
      to = bounds.length === 2 ? Number(bounds[1]) : from;
      if (bounds.length === 1 && stepRaw !== undefined) to = range.max;
      if (from < range.min || to > range.max) return "fieldRange";
      if (from > to) return "rangeOrder";
    }

    for (let value = from; value <= to; value += step) values.add(value);
  }

  return [...values].sort((left, right) => left - right);
}

export function parseCronExpression(expression: string): CronParseResult {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return { ok: false, reason: "fieldCount" };

  const minutes = expandField(fields[0], FIELD_RANGES.minute);
  if (!Array.isArray(minutes)) return { ok: false, reason: minutes };
  const hours = expandField(fields[1], FIELD_RANGES.hour);
  if (!Array.isArray(hours)) return { ok: false, reason: hours };
  const daysOfMonth = expandField(fields[2], FIELD_RANGES.dayOfMonth);
  if (!Array.isArray(daysOfMonth)) return { ok: false, reason: daysOfMonth };
  const months = expandField(fields[3], FIELD_RANGES.month);
  if (!Array.isArray(months)) return { ok: false, reason: months };
  const daysOfWeek = expandField(fields[4], FIELD_RANGES.dayOfWeek);
  if (!Array.isArray(daysOfWeek)) return { ok: false, reason: daysOfWeek };

  return {
    ok: true,
    cron: {
      minutes,
      hours,
      daysOfMonth,
      months,
      daysOfWeek: [...new Set(daysOfWeek.map((day) => (day === 7 ? 0 : day)))].sort((left, right) => left - right),
      dayOfMonthRestricted: fields[2] !== "*",
      dayOfWeekRestricted: fields[4] !== "*",
    },
  };
}

function dayMatches(cron: ParsedCron, cursor: TZDate): boolean {
  if (!cron.months.includes(cursor.getMonth() + 1)) return false;

  const dayOfMonthMatches = cron.daysOfMonth.includes(cursor.getDate());
  const dayOfWeekMatches = cron.daysOfWeek.includes(cursor.getDay());

  if (cron.dayOfMonthRestricted && cron.dayOfWeekRestricted) return dayOfMonthMatches || dayOfWeekMatches;
  if (cron.dayOfMonthRestricted) return dayOfMonthMatches;
  if (cron.dayOfWeekRestricted) return dayOfWeekMatches;

  return true;
}

export function nextCronOccurrence(cron: ParsedCron, after: Date, timeZone: string): Date | null {
  const start = new TZDate(after.getTime(), timeZone);
  let cursor = new TZDate(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, timeZone);
  let minuteFloor = start.getHours() * 60 + start.getMinutes() + 1;

  for (let dayIndex = 0; dayIndex < MAX_SEARCH_DAYS; dayIndex += 1) {
    if (dayMatches(cron, cursor)) {
      for (const hour of cron.hours) {
        for (const minute of cron.minutes) {
          if (hour * 60 + minute < minuteFloor) continue;

          const occurrence = new TZDate(
            cursor.getFullYear(),
            cursor.getMonth(),
            cursor.getDate(),
            hour,
            minute,
            timeZone,
          );
          if (occurrence.getTime() > after.getTime()) return new Date(occurrence.getTime());
        }
      }
    }

    cursor = addDays(cursor, 1);
    minuteFloor = 0;
  }

  return null;
}

export function smallestIntervalMinutes(cron: ParsedCron, from: Date, timeZone: string): number | null {
  let previous = nextCronOccurrence(cron, from, timeZone);
  if (!previous) return null;

  let smallest = Number.POSITIVE_INFINITY;
  for (let sample = 0; sample < INTERVAL_SAMPLE_COUNT; sample += 1) {
    const next = nextCronOccurrence(cron, previous, timeZone);
    if (!next) break;

    smallest = Math.min(smallest, (next.getTime() - previous.getTime()) / 60_000);
    previous = next;
  }

  return Number.isFinite(smallest) ? smallest : null;
}

let canonicalTimeZones: ReadonlySet<string> | undefined;

export function isSupportedTimeZone(timeZone: string): boolean {
  canonicalTimeZones ??= new Set(Intl.supportedValuesOf("timeZone"));
  if (canonicalTimeZones.has(timeZone)) return true;

  try {
    return !Number.isNaN(new TZDate(0, timeZone).getTime());
  } catch {
    return false;
  }
}
