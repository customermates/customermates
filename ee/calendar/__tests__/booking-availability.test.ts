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

    const { slots } = await subject.slots(LINK, NOW, new Date("2026-11-17T00:00:00.000Z"), 1);
    const starts = slots.map((slot) => slot.startsAt.slice(11, 16));

    expect(starts[0]).toBe("08:00");
    expect(starts).not.toContain("09:00");
    expect(starts).not.toContain("09:30");
    expect(starts).not.toContain("10:00");
    expect(starts).toContain("10:30");
  });

  it("applies the minimum notice to today's slots", async () => {
    const { subject } = availability();

    const { slots } = await subject.slots(LINK, new Date("2026-11-16T08:10:00.000Z"), undefined, 1);

    expect(slots[0].startsAt).toBe("2026-11-16T09:30:00.000Z");
  });

  async function everySlot(link: BookingLinkRow, days: number) {
    const { subject } = availability();
    const starts: string[] = [];
    let requests = 0;
    let from: string | null | undefined;
    do {
      const page = await subject.slots(link, NOW, from ? new Date(from) : undefined, days);
      starts.push(...page.slots.map((slot) => slot.startsAt));
      from = page.nextFrom;
      requests += 1;
    } while (from && requests < 100);
    return { starts, requests, open: from !== null };
  }

  it("says where the next range starts until the horizon is reached, so a 90-day page can be read to its end", async () => {
    const { starts, requests, open } = await everySlot({ ...LINK, horizonDays: 90 }, 31);

    expect(open).toBe(false);
    expect(requests).toBeGreaterThan(2);
    expect(new Set(starts).size).toBe(starts.length);
    expect(starts).toEqual([...starts].sort());
    expect(starts.at(-1)?.slice(0, 10)).toBe("2027-02-12");
    expect(starts).toHaveLength(65 * 16);
  });

  it("continues after the last slot it returned when one range holds more than a request carries", async () => {
    const dense = { ...LINK, durationMinutes: 15, horizonDays: 90 } as BookingLinkRow;
    const { subject } = availability();

    const first = await subject.slots(dense, NOW, undefined, 31);
    const second = await subject.slots(dense, NOW, new Date(first.nextFrom ?? ""), 31);
    const all = await everySlot(dense, 31);

    expect(first.slots).toHaveLength(500);
    expect(first.nextFrom).not.toBeNull();
    expect(second.slots[0].startsAt).toBe(first.nextFrom);
    expect(second.slots[0].startsAt > (first.slots.at(-1)?.startsAt ?? "")).toBe(true);
    expect(new Set(all.starts).size).toBe(all.starts.length);
    expect(all.starts.at(-1)?.slice(0, 10)).toBe("2027-02-12");
  });

  it("ends the paging when the range already reaches the horizon", async () => {
    const { subject } = availability();

    const page = await subject.slots(LINK, NOW, undefined, 31);

    expect(page.nextFrom).toBeNull();
    expect(page.slots.at(-1)?.startsAt.slice(0, 10)).toBe("2026-11-27");
  });

  it("checks the days the pages offer in ranges of 31 days and says when one of them could not be read in full", async () => {
    const complete = { window: vi.fn().mockResolvedValue({ intervals: [], truncated: false }) };
    const cut = {
      window: vi
        .fn()
        .mockResolvedValueOnce({ intervals: [], truncated: false })
        .mockResolvedValue({ intervals: [], truncated: true }),
    };
    const links = [LINK, { ...LINK, horizonDays: 90 }] as BookingLinkRow[];

    expect(await new BookingAvailability(complete as never, {} as never).busyTimeIncomplete(links, NOW)).toBe(false);
    expect(complete.window.mock.calls.map(([from, to]) => [from.toISOString(), to.toISOString()])).toEqual([
      ["2026-11-16T05:00:00.000Z", "2026-12-17T05:00:00.000Z"],
      ["2026-12-17T05:00:00.000Z", "2027-01-17T05:00:00.000Z"],
      ["2027-01-17T05:00:00.000Z", "2027-02-14T05:00:00.000Z"],
    ]);
    expect(await new BookingAvailability(cut as never, {} as never).busyTimeIncomplete(links, NOW)).toBe(true);
    expect(cut.window).toHaveBeenCalledTimes(2);
    expect(await new BookingAvailability(cut as never, {} as never).busyTimeIncomplete([], NOW)).toBe(false);
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
