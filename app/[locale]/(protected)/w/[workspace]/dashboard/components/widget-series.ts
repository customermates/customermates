import type { RecordMeasure, RecordMeasureDateInterval } from "@/features/records/record-measure.schema";

import { RECORD_MEASURE_MAX_GROUP_LIMIT } from "@/features/records/record-measure.schema";

export const RANKED_TABLE_ROW_LIMIT = 10;

export function shiftBucketStart(start: string, interval: RecordMeasureDateInterval, steps = 1): string {
  const [year, month, day] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (interval === "day") date.setUTCDate(date.getUTCDate() + steps);
  else if (interval === "week") date.setUTCDate(date.getUTCDate() + 7 * steps);
  else if (interval === "month") date.setUTCMonth(date.getUTCMonth() + steps);
  else if (interval === "quarter") date.setUTCMonth(date.getUTCMonth() + 3 * steps);
  else date.setUTCFullYear(date.getUTCFullYear() + steps);
  return date.toISOString().slice(0, 10);
}

export function bucketStartOf(date: string, interval: RecordMeasureDateInterval): string {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (interval === "week") start.setUTCDate(day - ((start.getUTCDay() + 6) % 7));
  else if (interval === "month") start.setUTCDate(1);
  else if (interval === "quarter") start.setUTCMonth(Math.floor((month - 1) / 3) * 3, 1);
  else if (interval === "year") start.setUTCMonth(0, 1);
  return start.toISOString().slice(0, 10);
}

function zonedDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(instant)
    .reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export type TimeSeriesWindow = { first: string; last: string };

/**
 * The bucket range a date-interval measure filters its own grouped field to, so the chart axis covers the whole
 * window instead of only the periods with records. Date endpoints are calendar dates; dateTime endpoints and today
 * fall in groupBy.timeZone. Returns null without a start (inLastDays, between, gte or gt) on the grouped field.
 */
export function measureTimeWindow(measure: RecordMeasure, now = new Date()): TimeSeriesWindow | null {
  const groupBy = measure.groupBy;
  if (!groupBy?.dateInterval || !groupBy.fieldId) return null;
  const timeZone = groupBy.timeZone ?? "UTC";
  const filters = [
    ...(groupBy.path.length === 0 ? measure.source.filters : []),
    ...(groupBy.filter?.filters ?? []),
  ].filter((filter) => filter.fieldId === groupBy.fieldId);
  const pointDate = (value: RecordMeasure["source"]["filters"][number]["value"] | undefined) =>
    value?.kind === "date"
      ? String(value.value).slice(0, 10)
      : value?.kind === "dateTime"
        ? zonedDate(new Date(String(value.value)), timeZone)
        : null;
  const starts: string[] = [];
  const ends: string[] = [];
  for (const filter of filters) {
    if (filter.operator === "inLastDays" && filter.value?.kind === "decimal") {
      const cutoff = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - Number(filter.value.value)),
      );
      starts.push(cutoff.toISOString().slice(0, 10));
    } else if (filter.operator === "between") {
      const [from, until] = (filter.values ?? []).map(pointDate);
      if (from) starts.push(from);
      if (until) ends.push(until);
    } else if (filter.operator === "gte" || filter.operator === "gt") {
      const from = pointDate(filter.value);
      if (from) starts.push(from);
    } else if (filter.operator === "lte" || filter.operator === "lt") {
      const until = pointDate(filter.value);
      if (until) ends.push(until);
    }
  }
  const latestStart = starts.sort().at(-1);
  if (!latestStart) return null;
  const first = bucketStartOf(latestStart, groupBy.dateInterval);
  const last = bucketStartOf(ends.sort()[0] ?? zonedDate(now, timeZone), groupBy.dateInterval);
  return first <= last ? { first, last } : null;
}

export function fillTimeSeries<T>(
  entries: Array<{ start: string; item: T }>,
  interval: RecordMeasureDateInterval,
  limit = RECORD_MEASURE_MAX_GROUP_LIMIT,
  window: TimeSeriesWindow | null = null,
): Array<{ start: string; item: T | null }> {
  const sorted = [...entries].sort((left, right) => (left.start < right.start ? -1 : left.start > right.start ? 1 : 0));
  const first = [sorted[0]?.start, window?.first].filter(Boolean).sort()[0];
  const last = [sorted.at(-1)?.start, window?.last].filter(Boolean).sort().at(-1);
  if (!sorted.length || !first || !last) return [];
  const byStart = new Map(sorted.map((entry) => [entry.start, entry.item]));
  const filled: Array<{ start: string; item: T | null }> = [];
  for (let start = first; start <= last; start = shiftBucketStart(start, interval)) {
    if (filled.length >= limit) return sorted;
    filled.push({ start, item: byStart.get(start) ?? null });
  }
  return filled;
}

export function isoWeek(start: string): { week: number; year: number } {
  const date = new Date(`${start}T00:00:00.000Z`);
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const year = thursday.getUTCFullYear();
  return { week: Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000 / 7) + 1, year };
}

export function closedLostOptionIds(options: Array<{ id: string; probability?: string | null }>): Set<string> {
  if (!options.some((option) => option.probability !== undefined && option.probability !== null)) return new Set();
  return new Set(
    options
      .filter(
        (option) => option.probability !== undefined && option.probability !== null && Number(option.probability) === 0,
      )
      .map((option) => option.id),
  );
}

export function isIntegerSeries(values: number[]): boolean {
  return values.every((value) => Number.isInteger(value));
}

export function bucketQuarter(start: string): number {
  return Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1;
}

export function orderFunnelSteps<T>(
  entries: Array<{ optionId: string; item: T }>,
  optionOrder: string[],
  fillMissing: boolean,
): Array<{ optionId: string; item: T | null }> {
  const position = (optionId: string) => {
    const index = optionOrder.indexOf(optionId);
    return index === -1 ? optionOrder.length : index;
  };
  const known = entries
    .filter((entry) => optionOrder.includes(entry.optionId))
    .sort((left, right) => position(left.optionId) - position(right.optionId));
  const unknown = entries.filter((entry) => !optionOrder.includes(entry.optionId));
  const ordered: Array<{ optionId: string; item: T | null }> = known;
  if (fillMissing && known.length) {
    const byOption = new Map(known.map((entry) => [entry.optionId, entry.item]));
    const span = optionOrder.slice(position(known[0].optionId), position(known[known.length - 1].optionId) + 1);
    return [...span.map((optionId) => ({ optionId, item: byOption.get(optionId) ?? null })), ...unknown];
  }
  return [...ordered, ...unknown];
}

export function orderByOptionPosition<T>(
  rows: T[],
  optionOrder: string[],
  optionIdOf: (row: T) => string | null,
  isMissing: (row: T) => boolean,
): T[] {
  const positions = new Map(optionOrder.map((optionId, index) => [optionId, index]));
  const rank = (row: T, index: number): [number, number] => {
    if (isMissing(row)) return [2, index];
    const optionId = optionIdOf(row);
    const position = optionId === null ? undefined : positions.get(optionId);
    return position === undefined ? [1, index] : [0, position];
  };
  return rows
    .map((row, index) => ({ row, rank: rank(row, index), index }))
    .sort((left, right) => left.rank[0] - right.rank[0] || left.rank[1] - right.rank[1] || left.index - right.index)
    .map(({ row }) => row);
}

export function funnelConversions(values: number[]): Array<number | null> {
  return values.map((value, index) => {
    if (index === 0) return null;
    const previous = values[index - 1];
    return previous > 0 && value <= previous ? value / previous : null;
  });
}

export function rankByValue<T extends { value: number | null; label: string }>(rows: T[], locale: string): T[] {
  const collator = new Intl.Collator(locale);
  return [...rows].sort((left, right) => {
    if (left.value === null && right.value === null) return collator.compare(left.label, right.label);
    if (left.value === null) return 1;
    if (right.value === null) return -1;
    return right.value - left.value || collator.compare(left.label, right.label);
  });
}

export function shareOfTotal(value: number | null, total: number | null): number | null {
  if (value === null || total === null || total <= 0 || value < 0) return null;
  return value / total;
}
