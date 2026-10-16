import { describe, expect, it } from "vitest";

import {
  formatZonedInstant,
  moveInstantToDate,
  zonedDate,
  zonedDayEndText,
  zonedDayStart,
  zonedDayStartText,
  zonedInstant,
  zonedOffsetMinutes,
} from "../zoned-time";

const noon = { hour: 12, minute: 0, second: 0, millisecond: 0 };

describe("zoned time", () => {
  it("reads the local day of an instant per time zone", () => {
    const instant = "2026-10-15T23:30:00Z";
    expect(zonedDate(instant, "UTC")).toBe("2026-10-15");
    expect(zonedDate(instant, "Europe/Berlin")).toBe("2026-10-16");
    expect(zonedDate(instant, "America/New_York")).toBe("2026-10-15");
    expect(zonedDate("2026-10-15T20:00:00Z", "Pacific/Auckland")).toBe("2026-10-16");
    expect(zonedDate("2026-10-15T19:00:00Z", "Asia/Kolkata")).toBe("2026-10-16");
  });

  it("knows the offset on both sides of a DST change", () => {
    expect(zonedOffsetMinutes(new Date("2026-03-29T00:30:00Z"), "Europe/Berlin")).toBe(60);
    expect(zonedOffsetMinutes(new Date("2026-03-29T01:30:00Z"), "Europe/Berlin")).toBe(120);
    expect(zonedOffsetMinutes(new Date("2026-10-25T00:30:00Z"), "Europe/Berlin")).toBe(120);
    expect(zonedOffsetMinutes(new Date("2026-10-25T01:30:00Z"), "Europe/Berlin")).toBe(60);
    expect(zonedOffsetMinutes(new Date("2026-10-16T12:00:00Z"), "Asia/Kolkata")).toBe(330);
  });

  it("finds the instant of a local wall time, shifting a skipped hour forward", () => {
    expect(zonedInstant("2026-10-16", noon, "Europe/Berlin").toISOString()).toBe("2026-10-16T10:00:00.000Z");
    expect(zonedInstant("2026-12-16", noon, "Europe/Berlin").toISOString()).toBe("2026-12-16T11:00:00.000Z");
    const skipped = { hour: 2, minute: 30, second: 0, millisecond: 0 };
    expect(zonedInstant("2026-03-29", skipped, "Europe/Berlin").toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(zonedInstant("2026-10-25", skipped, "Europe/Berlin").toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(zonedDayStart("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("writes instants with the local offset and microsecond day ends", () => {
    expect(formatZonedInstant(new Date("2026-10-16T07:05:09.042Z"), "Europe/Berlin")).toBe(
      "2026-10-16T09:05:09.042+02:00",
    );
    expect(zonedDayStartText("2026-10-25", "Europe/Berlin")).toBe("2026-10-25T00:00:00.000+02:00");
    expect(zonedDayEndText("2026-10-25", "Europe/Berlin")).toBe("2026-10-25T23:59:59.999999+01:00");
    expect(zonedDayEndText("2026-10-16", "UTC")).toBe("2026-10-16T23:59:59.999999+00:00");
    expect(zonedDayStartText("2026-10-16", "Asia/Kolkata")).toBe("2026-10-16T00:00:00.000+05:30");
  });

  it("moves a date-time to another day keeping its local time across DST", () => {
    expect(moveInstantToDate("2026-10-20T07:00:00.000Z", "2026-10-27", "Europe/Berlin")).toBe(
      "2026-10-27T09:00:00.000+01:00",
    );
    expect(moveInstantToDate("2026-03-27T08:15:00.000Z", "2026-03-30", "Europe/Berlin")).toBe(
      "2026-03-30T09:15:00.000+02:00",
    );
    expect(moveInstantToDate("2026-10-16T23:30:00.000Z", "2026-10-19", "America/New_York")).toBe(
      "2026-10-19T19:30:00.000-04:00",
    );
    expect(moveInstantToDate("2026-10-16T09:00:00+02:00", "2026-10-16", "Europe/Berlin")).toBe(
      "2026-10-16T09:00:00.000+02:00",
    );
  });
});
