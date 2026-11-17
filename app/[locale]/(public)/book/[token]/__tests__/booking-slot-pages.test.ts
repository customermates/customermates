import type { PublicBookingSlotsResult } from "@/ee/calendar/booking.schema";

import { describe, expect, it, vi } from "vitest";

import { bookingHorizonEnd, bookingMonthEnd, loadBookingSlots, needsMoreBookingSlots } from "../booking-slot-pages";

const DAY_MS = 86_400_000;
const START = Date.parse("2026-11-16T00:00:00.000Z");

function slotAt(day: number) {
  const startsAt = new Date(START + day * DAY_MS + 9 * 3_600_000).toISOString();
  return { startsAt, endsAt: new Date(Date.parse(startsAt) + 1_800_000).toISOString() };
}

function serverWith(daysWithSlots: number[], horizonDays: number, rangeDays = 31) {
  return vi.fn((from: string | undefined): Promise<PublicBookingSlotsResult> => {
    const first = from ? Math.ceil((Date.parse(from) - START) / DAY_MS) : 0;
    const last = Math.min(first + rangeDays, horizonDays);
    return Promise.resolve({
      status: "available",
      timeZone: "UTC",
      slots: daysWithSlots.filter((day) => day >= first && day < last).map(slotAt),
      nextFrom: last < horizonDays ? new Date(START + last * DAY_MS).toISOString() : null,
    });
  });
}

describe("loading booking slots in ranges", () => {
  it("asks once when the first range already covers what is shown", async () => {
    const read = serverWith([1, 2, 40], 90);

    const loaded = await loadBookingSlots({ read, from: null, through: START + 20 * DAY_MS, untilFirstSlot: true });

    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(undefined);
    expect(loaded).toMatchObject({ status: "loaded", nextFrom: new Date(START + 31 * DAY_MS).toISOString() });
    expect(loaded.status === "loaded" && loaded.slots).toHaveLength(2);
  });

  it("loads the month it shows first to its end, so no later day of that month stays grey", async () => {
    const read = serverWith([20, 40, 70], 90);

    const loaded = await loadBookingSlots({ read, from: null, through: 0, untilFirstSlot: true });

    expect(read.mock.calls.map(([from]) => from)).toEqual([undefined, new Date(START + 31 * DAY_MS).toISOString()]);
    expect(loaded.status === "loaded" && loaded.slots.map((slot) => slot.startsAt)).toEqual([
      slotAt(20).startsAt,
      slotAt(40).startsAt,
    ]);
    expect(loaded).toMatchObject({
      nextFrom: new Date(START + 62 * DAY_MS).toISOString(),
      through: bookingMonthEnd(new Date(slotAt(20).startsAt)),
    });
  });

  it("also fills the shown month when the server cuts a busy range short", async () => {
    const read = serverWith([1, 5, 9, 13], 90, 4);

    const loaded = await loadBookingSlots({ read, from: null, through: 0, untilFirstSlot: true });

    expect(loaded.status === "loaded" && loaded.slots).toHaveLength(4);
    expect(read.mock.calls.length).toBeGreaterThan(3);
    expect(loaded.status === "loaded" && Date.parse(loaded.nextFrom ?? "")).toBeGreaterThan(
      bookingMonthEnd(new Date(slotAt(1).startsAt)),
    );
  });

  it("does not move the shown month when it only loads more for a month the visitor opened", async () => {
    const read = serverWith([40], 90);

    const more = await loadBookingSlots({
      read,
      from: new Date(START + 31 * DAY_MS).toISOString(),
      through: START + 35 * DAY_MS,
      untilFirstSlot: false,
    });

    expect(read).toHaveBeenCalledTimes(1);
    expect(more).toMatchObject({ through: START + 35 * DAY_MS });
  });

  it("keeps asking for the next range until the month the visitor moved to is covered", async () => {
    const read = serverWith([1, 40, 70, 85], 90);
    const first = await loadBookingSlots({ read, from: null, through: 0, untilFirstSlot: true });
    if (first.status !== "loaded") throw new Error("expected slots");

    const more = await loadBookingSlots({
      read,
      from: first.nextFrom,
      through: START + 75 * DAY_MS,
      untilFirstSlot: false,
    });

    expect(read.mock.calls.map(([from]) => from)).toEqual([
      undefined,
      new Date(START + 31 * DAY_MS).toISOString(),
      new Date(START + 62 * DAY_MS).toISOString(),
    ]);
    expect(more.status === "loaded" && more.slots.map((slot) => slot.startsAt)).toEqual([
      slotAt(40).startsAt,
      slotAt(70).startsAt,
      slotAt(85).startsAt,
    ]);
    expect(more).toMatchObject({ nextFrom: null });
  });

  it("goes on to later ranges when the first weeks are fully booked, and stops at the horizon", async () => {
    const lateOnly = serverWith([80], 90);
    const none = serverWith([], 90);

    const found = await loadBookingSlots({ read: lateOnly, from: null, through: 0, untilFirstSlot: true });
    const empty = await loadBookingSlots({ read: none, from: null, through: 0, untilFirstSlot: true });

    expect(lateOnly).toHaveBeenCalledTimes(3);
    expect(found.status === "loaded" && found.slots.map((slot) => slot.startsAt)).toEqual([slotAt(80).startsAt]);
    expect(none).toHaveBeenCalledTimes(3);
    expect(empty).toEqual({ status: "loaded", slots: [], nextFrom: null, through: 0 });
  });

  it("reports a failed load when the page stops being available", async () => {
    const read = vi.fn().mockResolvedValue({ status: "unavailable" });

    expect(await loadBookingSlots({ read, from: null, through: 0, untilFirstSlot: true })).toEqual({
      status: "failed",
    });
  });

  it("knows when a shown month needs another range and how far the calendar may go", () => {
    const november = new Date(2026, 10, 1);

    expect(bookingMonthEnd(november)).toBe(new Date(2026, 11, 1).getTime() + DAY_MS);
    expect(needsMoreBookingSlots("2026-12-01T00:00:00.000Z", Date.parse("2026-12-31T00:00:00.000Z"))).toBe(true);
    expect(needsMoreBookingSlots("2027-01-05T00:00:00.000Z", Date.parse("2026-12-31T00:00:00.000Z"))).toBe(false);
    expect(needsMoreBookingSlots(null, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(bookingHorizonEnd(new Date(START), 90).toISOString()).toBe("2027-02-14T00:00:00.000Z");
  });
});
