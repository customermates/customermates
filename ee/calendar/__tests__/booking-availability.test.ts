import { describe, expect, it, vi } from "vitest";

import type { BookingLinkRow } from "../booking.schema";

import { BookingAvailability } from "../booking-availability";
import { DEFAULT_WORKING_HOURS } from "../working-hours";

const LINK = {
  id: "20000000-0000-4000-8000-000000000001",
  durationMinutes: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 60,
  horizonDays: 14,
  timeZone: "Europe/Berlin",
  workingHours: DEFAULT_WORKING_HOURS,
} as BookingLinkRow;

const NOW = new Date("2026-11-16T05:00:00.000Z");

function availability(calendarBusy: Array<[string, string]> = [], reservedBusy: Array<[string, string]> = []) {
  const toIntervals = (pairs: Array<[string, string]>) =>
    pairs.map(([from, to]) => ({ startsAt: new Date(from), endsAt: new Date(to) }));
  const busy = { read: vi.fn().mockResolvedValue(toIntervals(calendarBusy)) };
  const reservations = { busyForOwner: vi.fn().mockResolvedValue(toIntervals(reservedBusy)) };
  return { busy, reservations, subject: new BookingAvailability(busy as never, reservations as never) };
}

describe("BookingAvailability", () => {
  it("offers working-hour slots after the minimum notice and removes calendar busy time and reserved bookings", async () => {
    const { subject } = availability(
      [["2026-11-17T09:00:00.000Z", "2026-11-17T10:00:00.000Z"]],
      [["2026-11-17T10:00:00.000Z", "2026-11-17T10:30:00.000Z"]],
    );

    const slots = await subject.slots(LINK, NOW, new Date("2026-11-17T00:00:00.000Z"), 1);
    const starts = slots.map((slot) => slot.startsAt.slice(11, 16));

    expect(starts[0]).toBe("08:00");
    expect(starts).not.toContain("09:00");
    expect(starts).not.toContain("09:30");
    expect(starts).not.toContain("10:00");
    expect(starts).toContain("10:30");
  });

  it("applies the minimum notice to today's slots", async () => {
    const { subject } = availability();

    const slots = await subject.slots(LINK, new Date("2026-11-16T08:10:00.000Z"), undefined, 1);

    expect(slots[0].startsAt).toBe("2026-11-16T09:30:00.000Z");
  });

  it("knows whether a start is still open, including one a reservation just took", async () => {
    const free = availability();
    const taken = availability([], [["2026-11-17T09:00:00.000Z", "2026-11-17T09:30:00.000Z"]]);

    expect(await free.subject.isOpen(LINK, NOW, new Date("2026-11-17T09:00:00.000Z"))).toBe(true);
    expect(await taken.subject.isOpen(LINK, NOW, new Date("2026-11-17T09:00:00.000Z"))).toBe(false);
    expect(await free.subject.isOpen(LINK, NOW, new Date("2026-11-17T09:15:00.000Z"))).toBe(false);
    expect(await free.subject.isOpen(LINK, NOW, new Date("2026-12-31T09:00:00.000Z"))).toBe(false);
  });
});
