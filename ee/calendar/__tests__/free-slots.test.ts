import { describe, expect, it } from "vitest";

import { computeFreeSlots, isFreeSlot, type FreeSlotRules } from "../free-slots";
import { DEFAULT_WORKING_HOURS, WorkingHoursSchema } from "../working-hours";

const BERLIN: FreeSlotRules = {
  workingHours: DEFAULT_WORKING_HOURS,
  timeZone: "Europe/Berlin",
  durationMinutes: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 0,
  horizonDays: 14,
  stepMinutes: 30,
};

const MONDAY_MORNING = new Date("2026-11-16T05:00:00Z");

function startsOn(slots: { startsAt: string }[], day: string) {
  return slots.filter((slot) => slot.startsAt.startsWith(day)).map((slot) => slot.startsAt.slice(11, 16));
}

describe("computeFreeSlots", () => {
  it("offers working hours in the link time zone as UTC instants", () => {
    const slots = computeFreeSlots({ rules: BERLIN, now: MONDAY_MORNING, busy: [], limit: 1000 });

    expect(startsOn(slots, "2026-11-16")[0]).toBe("08:00");
    expect(startsOn(slots, "2026-11-16").at(-1)).toBe("15:30");
    expect(startsOn(slots, "2026-11-16")).toHaveLength(16);
  });

  it("closes the weekend", () => {
    const slots = computeFreeSlots({ rules: BERLIN, now: MONDAY_MORNING, busy: [], limit: 1000 });

    expect(startsOn(slots, "2026-11-21")).toEqual([]);
    expect(startsOn(slots, "2026-11-22")).toEqual([]);
    expect(startsOn(slots, "2026-11-23")).toHaveLength(16);
  });

  it("removes slots that overlap a busy interval and respects the buffer on both sides", () => {
    const busy = [{ startsAt: new Date("2026-11-16T09:00:00Z"), endsAt: new Date("2026-11-16T10:00:00Z") }];

    const plain = computeFreeSlots({ rules: BERLIN, now: MONDAY_MORNING, busy, limit: 1000 });
    const buffered = computeFreeSlots({
      rules: { ...BERLIN, bufferMinutes: 15 },
      now: MONDAY_MORNING,
      busy,
      limit: 1000,
    });

    expect(startsOn(plain, "2026-11-16")).not.toContain("09:00");
    expect(startsOn(plain, "2026-11-16")).not.toContain("09:30");
    expect(startsOn(plain, "2026-11-16")).toContain("08:30");
    expect(startsOn(plain, "2026-11-16")).toContain("10:00");
    expect(startsOn(buffered, "2026-11-16")).not.toContain("08:30");
    expect(startsOn(buffered, "2026-11-16")).not.toContain("10:00");
    expect(startsOn(buffered, "2026-11-16")).toContain("08:00");
    expect(startsOn(buffered, "2026-11-16")).toContain("10:30");
  });

  it("applies the minimum notice and the horizon", () => {
    const now = new Date("2026-11-16T08:10:00Z");

    const slots = computeFreeSlots({
      rules: { ...BERLIN, minNoticeMinutes: 120, horizonDays: 2 },
      now,
      busy: [],
      limit: 1000,
    });

    expect(slots[0].startsAt).toBe("2026-11-16T10:30:00.000Z");
    expect(slots.every((slot) => new Date(slot.startsAt) <= new Date("2026-11-18T08:10:00Z"))).toBe(true);
  });

  it("follows daylight saving time changes of the link time zone", () => {
    const before = computeFreeSlots({
      rules: BERLIN,
      now: new Date("2026-03-23T00:00:00Z"),
      busy: [],
      from: new Date("2026-03-26T00:00:00Z"),
      to: new Date("2026-03-26T23:00:00Z"),
    });
    const after = computeFreeSlots({
      rules: BERLIN,
      now: new Date("2026-03-23T00:00:00Z"),
      busy: [],
      from: new Date("2026-03-30T00:00:00Z"),
      to: new Date("2026-03-30T23:00:00Z"),
    });

    expect(before[0].startsAt).toBe("2026-03-26T08:00:00.000Z");
    expect(after[0].startsAt).toBe("2026-03-30T07:00:00.000Z");
  });

  it("supports several windows per day and a duration that does not divide a window", () => {
    const hours = WorkingHoursSchema.parse({
      ...DEFAULT_WORKING_HOURS,
      monday: [
        { start: "09:00", end: "10:00" },
        { start: "13:00", end: "14:15" },
      ],
    });

    const slots = computeFreeSlots({
      rules: { ...BERLIN, workingHours: hours, durationMinutes: 45, stepMinutes: 15 },
      now: MONDAY_MORNING,
      busy: [],
      to: new Date("2026-11-16T23:00:00Z"),
    });

    expect(startsOn(slots, "2026-11-16")).toEqual(["08:00", "08:15", "12:00", "12:15", "12:30"]);
  });

  it("stops at the requested limit", () => {
    expect(computeFreeSlots({ rules: BERLIN, now: MONDAY_MORNING, busy: [], limit: 3 })).toHaveLength(3);
  });
});

describe("isFreeSlot", () => {
  const query = { rules: BERLIN, now: MONDAY_MORNING, busy: [] };

  it("accepts an offered slot and refuses an off-grid, closed or past start", () => {
    expect(isFreeSlot(query, new Date("2026-11-17T09:00:00Z"))).toBe(true);
    expect(isFreeSlot(query, new Date("2026-11-17T09:10:00Z"))).toBe(false);
    expect(isFreeSlot(query, new Date("2026-11-21T09:00:00Z"))).toBe(false);
    expect(isFreeSlot(query, new Date("2026-11-15T09:00:00Z"))).toBe(false);
  });

  it("refuses a slot that a busy interval now covers", () => {
    const busy = [{ startsAt: new Date("2026-11-17T09:00:00Z"), endsAt: new Date("2026-11-17T09:30:00Z") }];

    expect(isFreeSlot({ ...query, busy }, new Date("2026-11-17T09:00:00Z"))).toBe(false);
  });
});

describe("WorkingHoursSchema", () => {
  it("rejects overlapping windows, reversed windows and malformed times", () => {
    const overlapping = { ...DEFAULT_WORKING_HOURS, monday: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }] };
    const reversed = { ...DEFAULT_WORKING_HOURS, monday: [{ start: "12:00", end: "09:00" }] };
    const malformed = { ...DEFAULT_WORKING_HOURS, monday: [{ start: "9:00", end: "12:00" }] };

    expect(WorkingHoursSchema.safeParse(overlapping).success).toBe(false);
    expect(WorkingHoursSchema.safeParse(reversed).success).toBe(false);
    expect(WorkingHoursSchema.safeParse(malformed).success).toBe(false);
    expect(WorkingHoursSchema.safeParse(DEFAULT_WORKING_HOURS).success).toBe(true);
  });
});
