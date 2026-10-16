export type CalendarDate = string;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function utcDay(date: CalendarDate): number {
  const match = CALENDAR_DATE.exec(date);
  if (!match) throw new Error(`Invalid calendar date ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtcDay(time: number): CalendarDate {
  return new Date(time).toISOString().slice(0, 10);
}

export function calendarDateParts(date: CalendarDate): { year: number; month: number; day: number } {
  const value = new Date(utcDay(date));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

export function calendarDateOf(year: number, month: number, day: number): CalendarDate {
  return fromUtcDay(Date.UTC(year, month - 1, day));
}

export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return fromUtcDay(utcDay(date) + days * DAY_MS);
}

export function calendarDayDifference(from: CalendarDate, to: CalendarDate): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

export function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function calendarWeekdayIndex(date: CalendarDate): number {
  return (new Date(utcDay(date)).getUTCDay() + 6) % 7;
}

export function startOfCalendarWeek(date: CalendarDate): CalendarDate {
  return addCalendarDays(date, -calendarWeekdayIndex(date));
}

export function endOfCalendarWeek(date: CalendarDate): CalendarDate {
  return addCalendarDays(startOfCalendarWeek(date), 6);
}

export function startOfCalendarMonth(date: CalendarDate): CalendarDate {
  const { year, month } = calendarDateParts(date);
  return calendarDateOf(year, month, 1);
}

export function endOfCalendarMonth(date: CalendarDate): CalendarDate {
  const { year, month } = calendarDateParts(date);
  return calendarDateOf(year, month + 1, 0);
}

export function addCalendarMonths(date: CalendarDate, months: number): CalendarDate {
  const { year, month, day } = calendarDateParts(date);
  const last = calendarDateParts(calendarDateOf(year, month + months + 1, 0)).day;
  return calendarDateOf(year, month + months, Math.min(day, last));
}

export function calendarDatesBetween(from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const count = calendarDayDifference(from, to);
  return Array.from({ length: Math.max(0, count + 1) }, (_, index) => addCalendarDays(from, index));
}

export function calendarMonthWeeks(anchor: CalendarDate): CalendarDate[][] {
  const from = startOfCalendarWeek(startOfCalendarMonth(anchor));
  const to = endOfCalendarWeek(endOfCalendarMonth(anchor));
  const days = calendarDatesBetween(from, to);
  return Array.from({ length: days.length / 7 }, (_, week) => days.slice(week * 7, week * 7 + 7));
}
