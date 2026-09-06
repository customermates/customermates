import { describe, expect, it } from "vitest";

import {
  MIN_ROUTINE_INTERVAL_MINUTES,
  isSupportedTimeZone,
  nextCronOccurrence,
  parseCronExpression,
  smallestIntervalMinutes,
} from "@/ee/routines/routine-schedule";

function parseOrThrow(expression: string) {
  const result = parseCronExpression(expression);
  if (!result.ok) throw new Error(`expected ${expression} to parse, got ${result.reason}`);

  return result.cron;
}

describe("cron parsing", () => {
  it("expands a step field", () => {
    expect(parseOrThrow("*/15 * * * *").minutes).toEqual([0, 15, 30, 45]);
  });

  it("expands lists and ranges", () => {
    expect(parseOrThrow("0,30 9-11 * * *").minutes).toEqual([0, 30]);
    expect(parseOrThrow("0,30 9-11 * * *").hours).toEqual([9, 10, 11]);
  });

  it("normalizes day seven to Sunday", () => {
    expect(parseOrThrow("0 9 * * 7").daysOfWeek).toEqual([0]);
  });

  it("rejects the wrong number of fields", () => {
    expect(parseCronExpression("* * * *")).toEqual({ ok: false, reason: "fieldCount" });
    expect(parseCronExpression("0 0 1 1 0 0")).toEqual({ ok: false, reason: "fieldCount" });
  });

  it("rejects out-of-range values", () => {
    expect(parseCronExpression("60 * * * *")).toEqual({ ok: false, reason: "fieldRange" });
    expect(parseCronExpression("0 24 * * *")).toEqual({ ok: false, reason: "fieldRange" });
  });

  it("rejects inverted ranges and bad syntax", () => {
    expect(parseCronExpression("30-10 * * * *")).toEqual({ ok: false, reason: "rangeOrder" });
    expect(parseCronExpression("a * * * *")).toEqual({ ok: false, reason: "fieldSyntax" });
    expect(parseCronExpression("*/0 * * * *")).toEqual({ ok: false, reason: "stepValue" });
  });
});

describe("next occurrence", () => {
  it("finds the next daily run in a named time zone", () => {
    const next = nextCronOccurrence(parseOrThrow("0 9 * * *"), new Date("2026-09-01T06:00:00Z"), "Europe/Berlin");

    expect(next?.toISOString()).toBe("2026-09-01T07:00:00.000Z");
  });

  it("rolls to the following day once the time has passed", () => {
    const next = nextCronOccurrence(parseOrThrow("0 9 * * *"), new Date("2026-09-01T08:00:00Z"), "Europe/Berlin");

    expect(next?.toISOString()).toBe("2026-09-02T07:00:00.000Z");
  });

  it("keeps local wall-clock time across a daylight-saving transition", () => {
    const beforeShift = nextCronOccurrence(
      parseOrThrow("0 9 * * *"),
      new Date("2026-10-24T12:00:00Z"),
      "Europe/Berlin",
    );
    const afterShift = nextCronOccurrence(parseOrThrow("0 9 * * *"), new Date("2026-10-25T12:00:00Z"), "Europe/Berlin");

    expect(beforeShift?.toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(afterShift?.toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  it("honours a weekday restriction", () => {
    const next = nextCronOccurrence(parseOrThrow("0 9 * * 1"), new Date("2026-09-01T12:00:00Z"), "UTC");

    expect(next?.toISOString()).toBe("2026-09-07T09:00:00.000Z");
  });

  it("treats day-of-month and day-of-week as a union when both are restricted", () => {
    const cron = parseOrThrow("0 9 3 * 1");
    const next = nextCronOccurrence(cron, new Date("2026-09-01T12:00:00Z"), "UTC");

    expect(next?.toISOString()).toBe("2026-09-03T09:00:00.000Z");
  });

  it("never returns an occurrence at or before the reference instant", () => {
    const exactly = new Date("2026-09-01T09:00:00Z");
    const next = nextCronOccurrence(parseOrThrow("0 9 * * *"), exactly, "UTC");

    expect(next?.toISOString()).toBe("2026-09-02T09:00:00.000Z");
  });

  it("returns null for an unreachable expression", () => {
    expect(nextCronOccurrence(parseOrThrow("0 9 30 2 *"), new Date("2026-09-01T00:00:00Z"), "UTC")).toBeNull();
  });
});

describe("interval floor", () => {
  it("measures the smallest gap between occurrences", () => {
    expect(smallestIntervalMinutes(parseOrThrow("*/5 * * * *"), new Date("2026-09-01T00:00:00Z"), "UTC")).toBe(5);
    expect(smallestIntervalMinutes(parseOrThrow("0 9 * * *"), new Date("2026-09-01T00:00:00Z"), "UTC")).toBe(1440);
  });

  it("catches an expression that breaches the platform floor", () => {
    const smallest = smallestIntervalMinutes(parseOrThrow("* * * * *"), new Date("2026-09-01T00:00:00Z"), "UTC");

    expect(smallest).toBeLessThan(MIN_ROUTINE_INTERVAL_MINUTES);
  });

  it("catches a clustered expression whose average gap looks safe", () => {
    const smallest = smallestIntervalMinutes(parseOrThrow("0,1 9 * * *"), new Date("2026-09-01T00:00:00Z"), "UTC");

    expect(smallest).toBe(1);
  });
});

describe("time zones", () => {
  it("accepts IANA zones and rejects nonsense", () => {
    expect(isSupportedTimeZone("Europe/Berlin")).toBe(true);
    expect(isSupportedTimeZone("UTC")).toBe(true);
    expect(isSupportedTimeZone("Mars/Olympus")).toBe(false);
    expect(isSupportedTimeZone("")).toBe(false);
  });

  it("accepts a legacy zone alias", () => {
    expect(isSupportedTimeZone("Europe/Kiev")).toBe(true);
  });
});
