import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DATE_PRESETS,
  RANGE_PRESET_KEYS,
  localTimeValue,
  parseIsoDate,
  rangeForPreset,
  toLocalIso,
} from "../iso-date-values";

const NOW = new Date(2026, 2, 9, 14, 30, 45);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function ymd(date: Date): string {
  return toLocalIso(date, true);
}

describe("single-date presets", () => {
  it("offers today, one week, one month, and one year from the given day", () => {
    expect(DATE_PRESETS.map((preset) => preset.key)).toEqual(["today", "inAWeek", "inAMonth", "inAYear"]);

    const baseToday = new Date(2026, 2, 9);
    const computed = DATE_PRESETS.map((preset) => ymd(preset.compute(baseToday)));

    expect(computed).toEqual(["2026-03-09", "2026-03-16", "2026-04-09", "2027-03-09"]);
  });
});

describe("range presets", () => {
  it("exposes the six range keys in display order", () => {
    expect(RANGE_PRESET_KEYS).toEqual(["today", "inAWeek", "thisMonth", "nextMonth", "next7Days", "next30Days"]);
  });

  it("resolves each key to a local-midnight range", () => {
    const ranges = Object.fromEntries(
      RANGE_PRESET_KEYS.map((key) => {
        const range = rangeForPreset(key);
        return [key, [ymd(range.from), ymd(range.to)]];
      }),
    );

    expect(ranges).toEqual({
      today: ["2026-03-09", "2026-03-09"],
      inAWeek: ["2026-03-16", "2026-03-16"],
      thisMonth: ["2026-03-01", "2026-03-31"],
      nextMonth: ["2026-04-01", "2026-04-30"],
      next7Days: ["2026-03-09", "2026-03-15"],
      next30Days: ["2026-03-09", "2026-04-07"],
    });
  });

  it("starts single-day presets at midnight rather than the current time", () => {
    const { from } = rangeForPreset("today");

    expect([from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe("parseIsoDate", () => {
  it("parses a stored value and rejects anything unusable", () => {
    expect(parseIsoDate("2026-03-09")?.getTime()).toBe(new Date("2026-03-09").getTime());
    expect(parseIsoDate(undefined)).toBeUndefined();
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate("not-a-date")).toBeUndefined();
  });
});

describe("toLocalIso", () => {
  it("serializes a date-only value from local calendar fields", () => {
    expect(toLocalIso(new Date(2026, 2, 9, 23, 59, 59), true)).toBe("2026-03-09");
    expect(toLocalIso(new Date(2026, 0, 1, 0, 0, 0), true)).toBe("2026-01-01");
  });

  it("keeps the full instant when the value carries a time", () => {
    const withTime = new Date(2026, 2, 9, 14, 30, 45);

    expect(toLocalIso(withTime, false)).toBe(withTime.toISOString());
  });
});

describe("localTimeValue", () => {
  it("renders zero-padded hours, minutes, and seconds", () => {
    expect(localTimeValue(new Date(2026, 2, 9, 14, 30, 45))).toBe("14:30:45");
    expect(localTimeValue(new Date(2026, 2, 9, 0, 5, 9))).toBe("00:05:09");
  });
});
