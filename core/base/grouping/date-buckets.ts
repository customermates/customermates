import type { DateBucket } from "./grouping.schema";

import { addDays, addMonths, addWeeks, startOfDay, startOfMonth, startOfWeek } from "date-fns";

export const EARLIER_GROUP_KEY = "earlier";
export const LATER_GROUP_KEY = "later";

export type DateBucketRole = "window" | "earlier" | "later";

export type DateBucketEntry = {
  key: string;
  role: DateBucketRole;
  start?: Date;
  end?: Date;
};

const WINDOW_COUNT: Record<DateBucket, number> = { day: 7, week: 7, month: 12 };

function startOfBucket(bucket: DateBucket, moment: Date): Date {
  switch (bucket) {
    case "day":
      return startOfDay(moment);
    case "week":
      return startOfWeek(moment);
    case "month":
      return startOfMonth(moment);
  }
}

function shiftBucket(bucket: DateBucket, moment: Date, amount: number): Date {
  switch (bucket) {
    case "day":
      return addDays(moment, amount);
    case "week":
      return addWeeks(moment, amount);
    case "month":
      return addMonths(moment, amount);
  }
}

export function dateBucketLadder(bucket: DateBucket, now: Date): DateBucketEntry[] {
  const newestStart = startOfBucket(bucket, now);

  const windows: DateBucketEntry[] = Array.from({ length: WINDOW_COUNT[bucket] }, (_unused, offset) => {
    const start = shiftBucket(bucket, newestStart, -offset);

    return {
      key: `${bucket}:${start.toISOString()}`,
      role: "window" as const,
      start,
      end: shiftBucket(bucket, start, 1),
    };
  });

  return [
    { key: LATER_GROUP_KEY, role: "later", start: shiftBucket(bucket, newestStart, 1) },
    ...windows,
    { key: EARLIER_GROUP_KEY, role: "earlier", end: windows[windows.length - 1].start },
  ];
}

export function dateBucketEntry(key: string, bucket: DateBucket, now: Date): DateBucketEntry | undefined {
  const ladder = dateBucketLadder(bucket, now);
  const known = ladder.find((entry) => entry.key === key);
  if (known) return known;

  const separator = key.indexOf(":");
  if (separator === -1 || key.slice(0, separator) !== bucket) return undefined;

  const start = new Date(key.slice(separator + 1));
  if (Number.isNaN(start.getTime())) return undefined;

  return { key, role: "window", start, end: shiftBucket(bucket, start, 1) };
}
