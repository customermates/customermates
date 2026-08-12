import { addDays, addMonths, addWeeks, addYears, endOfMonth, startOfMonth } from "date-fns";

export type RangePresetKey = "today" | "inAWeek" | "thisMonth" | "nextMonth" | "next7Days" | "next30Days";

export const DATE_PRESETS: ReadonlyArray<{ key: string; compute: (today: Date) => Date }> = [
  { key: "today", compute: (d) => d },
  { key: "inAWeek", compute: (d) => addWeeks(d, 1) },
  { key: "inAMonth", compute: (d) => addMonths(d, 1) },
  { key: "inAYear", compute: (d) => addYears(d, 1) },
];

export const RANGE_PRESET_KEYS: ReadonlyArray<RangePresetKey> = [
  "today",
  "inAWeek",
  "thisMonth",
  "nextMonth",
  "next7Days",
  "next30Days",
];

export function rangeForPreset(key: RangePresetKey): { from: Date; to: Date } {
  const today = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const baseToday = start(today);
  switch (key) {
    case "today":
      return { from: baseToday, to: baseToday };
    case "inAWeek": {
      const d = addWeeks(baseToday, 1);
      return { from: d, to: d };
    }
    case "thisMonth":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "nextMonth": {
      const next = addMonths(today, 1);
      return { from: startOfMonth(next), to: endOfMonth(next) };
    }
    case "next7Days":
      return { from: baseToday, to: addDays(baseToday, 6) };
    case "next30Days":
      return { from: baseToday, to: addDays(baseToday, 29) };
  }
}

export function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function toLocalIso(date: Date, dateOnly: boolean): string {
  if (dateOnly) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return date.toISOString();
}

export function localTimeValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
