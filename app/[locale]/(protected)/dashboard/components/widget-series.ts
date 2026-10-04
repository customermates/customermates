import type { RecordMeasureDateInterval } from "@/features/records/record-measure.schema";

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

export function fillTimeSeries<T>(
  entries: Array<{ start: string; item: T }>,
  interval: RecordMeasureDateInterval,
  limit = RECORD_MEASURE_MAX_GROUP_LIMIT,
): Array<{ start: string; item: T | null }> {
  const sorted = [...entries].sort((left, right) => (left.start < right.start ? -1 : left.start > right.start ? 1 : 0));
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) return [];
  const byStart = new Map(sorted.map((entry) => [entry.start, entry.item]));
  const filled: Array<{ start: string; item: T | null }> = [];
  for (let start = first.start; start <= last.start; start = shiftBucketStart(start, interval)) {
    if (filled.length >= limit) return sorted;
    filled.push({ start, item: byStart.get(start) ?? null });
  }
  return filled;
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

export function funnelConversions(values: number[]): Array<number | null> {
  return values.map((value, index) => {
    if (index === 0) return null;
    const previous = values[index - 1];
    return previous > 0 ? value / previous : null;
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
