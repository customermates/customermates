import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  addCalendarMonths,
  calendarDatesBetween,
  calendarDayDifference,
  calendarMonthWeeks,
  calendarWeekdayIndex,
  endOfCalendarMonth,
  isCalendarDate,
  startOfCalendarWeek,
} from "../calendar-date";
import { calendarWindowRange, shiftCalendarAnchor } from "../calendar-window";

describe("calendar dates", () => {
  it("accepts only real calendar days", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-10-16T00:00:00Z")).toBe(false);
  });

  it("adds days across months, years and DST changes without drifting", () => {
    expect(addCalendarDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addCalendarDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(calendarDayDifference("2026-10-01", "2026-11-01")).toBe(31);
  });

  it("starts weeks on Monday", () => {
    expect(calendarWeekdayIndex("2026-10-12")).toBe(0);
    expect(calendarWeekdayIndex("2026-10-18")).toBe(6);
    expect(startOfCalendarWeek("2026-10-18")).toBe("2026-10-12");
    expect(startOfCalendarWeek("2026-10-12")).toBe("2026-10-12");
  });

  it("clamps the day when moving by months", () => {
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addCalendarMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addCalendarMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(endOfCalendarMonth("2028-02-10")).toBe("2028-02-29");
  });

  it("lays out a month as whole Monday-to-Sunday weeks", () => {
    const weeks = calendarMonthWeeks("2026-10-16");
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-09-28");
    expect(weeks.at(-1)?.at(-1)).toBe("2026-11-01");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(calendarMonthWeeks("2026-02-01")).toHaveLength(5);
    expect(calendarMonthWeeks("2027-02-01")).toHaveLength(4);
    expect(calendarMonthWeeks("2026-08-01")).toHaveLength(6);
  });

  it("lists every day of a range", () => {
    expect(calendarDatesBetween("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(calendarDatesBetween("2026-10-02", "2026-10-01")).toEqual([]);
  });

  it("derives the window of each calendar mode and steps the anchor", () => {
    expect(calendarWindowRange("month", "2026-10-16")).toEqual({ from: "2026-09-28", to: "2026-11-01" });
    expect(calendarWindowRange("agenda", "2026-10-16")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(calendarWindowRange("week", "2026-10-16")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(shiftCalendarAnchor("week", "2026-10-16", -1)).toBe("2026-10-09");
    expect(shiftCalendarAnchor("month", "2026-10-31", 1)).toBe("2026-11-30");
    expect(calendarWindowRange("quarter", "2026-11-16")).toEqual({ from: "2026-09-28", to: "2027-01-03" });
    expect(shiftCalendarAnchor("quarter", "2026-11-16", 1)).toBe("2027-02-16");
  });
});
