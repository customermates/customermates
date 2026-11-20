import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";

const CANDIDATE_SLACK_DAYS = 2;

type DateOffset = { days: number; direction: "before" | "after"; atHour: number; timezone: string };
type DateValue = { kind: "date" | "dateTime"; value: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export function localDay(instant: Date, timeZone: string): string {
  return format(new TZDate(instant, timeZone), "yyyy-MM-dd");
}

export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

export function dayOf(value: DateValue, timeZone: string): string {
  if (value.kind === "date") return value.value.slice(0, 10);
  return localDay(new Date(value.value), timeZone);
}

export function dateReachedFireAt(offset: DateOffset, value: DateValue): Date | null {
  const sign = offset.direction === "before" ? -1 : 1;
  if (value.kind === "date") {
    const [year, month, date] = shiftDay(value.value.slice(0, 10), sign * offset.days)
      .split("-")
      .map(Number);
    const fire = new TZDate(year, month - 1, date, offset.atHour, 0, 0, 0, offset.timezone);
    return Number.isNaN(fire.getTime()) ? null : new Date(fire.getTime());
  }
  const instant = new Date(value.value);
  if (Number.isNaN(instant.getTime())) return null;
  const shifted = addDays(new TZDate(instant, offset.timezone), sign * offset.days);
  return new Date(shifted.getTime());
}

export function isDateReachedDue(fireAt: Date, now: Date, lookbackDays: number): boolean {
  const age = now.getTime() - fireAt.getTime();
  return age >= 0 && age <= lookbackDays * DAY_MS;
}

export function dateReachedCandidateWindow(
  offset: Pick<DateOffset, "days" | "direction">,
  now: Date,
  lookbackDays: number,
): { from: Date; to: Date } {
  const sign = offset.direction === "before" ? -1 : 1;
  const shift = sign * offset.days * DAY_MS;
  const slack = CANDIDATE_SLACK_DAYS * DAY_MS;
  return {
    from: new Date(now.getTime() - lookbackDays * DAY_MS - shift - slack),
    to: new Date(now.getTime() - shift + slack),
  };
}
