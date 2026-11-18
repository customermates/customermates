import { describe, expect, it, vi } from "vitest";

import { getTenantUser, runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";

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

const HOST = "host-1";

type Busy = Array<[string, string]> | Array<[string, string, string]>;

function toIntervals(pairs: Busy) {
  return pairs.map(([from, to, eventId]) => ({
    startsAt: new Date(from),
    endsAt: new Date(to),
    ...(eventId ? { eventId } : {}),
  }));
}

const runAs = <T>(userId: string, work: () => Promise<T>) => runWithTenant(createMockUser({ id: userId }), work);

function availability(calendarBusy: Busy = [], reservedBusy: Busy = []) {
  const busy = { read: vi.fn().mockResolvedValue(toIntervals(calendarBusy)) };
  const reservations = { busyForOwner: vi.fn().mockResolvedValue(toIntervals(reservedBusy)) };
  return { busy, reservations, subject: new BookingAvailability(busy as never, reservations as never, runAs) };
}

function perHost(calendarBusy: Record<string, Busy>, reservedBusy: Record<string, Busy> = {}) {
  const busy = {
    read: vi.fn(() => Promise.resolve(toIntervals(calendarBusy[getTenantUser().id] ?? []))),
  };
  const reservations = {
    busyForOwner: vi.fn(() => Promise.resolve(toIntervals(reservedBusy[getTenantUser().id] ?? []))),
  };
  return { busy, reservations, subject: new BookingAvailability(busy as never, reservations as never, runAs) };
}

describe("BookingAvailability", () => {
  it("offers working-hour slots after the minimum notice and removes calendar busy time and reserved bookings", async () => {
    const { subject } = availability(
      [["2026-11-17T09:00:00.000Z", "2026-11-17T10:00:00.000Z"]],
      [["2026-11-17T10:00:00.000Z", "2026-11-17T10:30:00.000Z"]],
    );

    const { slots } = await subject.slots(LINK, [HOST], NOW, new Date("2026-11-17T00:00:00.000Z"), 1);
    const starts = slots.map((slot) => slot.startsAt.slice(11, 16));

    expect(starts[0]).toBe("08:00");
    expect(starts).not.toContain("09:00");
    expect(starts).not.toContain("09:30");
    expect(starts).not.toContain("10:00");
    expect(starts).toContain("10:30");
  });

  it("applies the minimum notice to today's slots", async () => {
    const { subject } = availability();

    const { slots } = await subject.slots(LINK, [HOST], new Date("2026-11-16T08:10:00.000Z"), undefined, 1);

    expect(slots[0].startsAt).toBe("2026-11-16T09:30:00.000Z");
  });

  async function everySlot(link: BookingLinkRow, days: number) {
    const { subject } = availability();
    const starts: string[] = [];
    let requests = 0;
    let from: string | null | undefined;
    do {
      const page = await subject.slots(link, [HOST], NOW, from ? new Date(from) : undefined, days);
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

    const first = await subject.slots(dense, [HOST], NOW, undefined, 31);
    const second = await subject.slots(dense, [HOST], NOW, new Date(first.nextFrom ?? ""), 31);
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

    const page = await subject.slots(LINK, [HOST], NOW, undefined, 31);

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

    expect(await new BookingAvailability(complete as never, {} as never, runAs).busyTimeIncomplete(links, NOW)).toBe(
      false,
    );
    expect(complete.window.mock.calls.map(([from, to]) => [from.toISOString(), to.toISOString()])).toEqual([
      ["2026-11-16T05:00:00.000Z", "2026-12-17T05:00:00.000Z"],
      ["2026-12-17T05:00:00.000Z", "2027-01-17T05:00:00.000Z"],
      ["2027-01-17T05:00:00.000Z", "2027-02-14T05:00:00.000Z"],
    ]);
    expect(await new BookingAvailability(cut as never, {} as never, runAs).busyTimeIncomplete(links, NOW)).toBe(true);
    expect(cut.window).toHaveBeenCalledTimes(2);
    expect(await new BookingAvailability(cut as never, {} as never, runAs).busyTimeIncomplete([], NOW)).toBe(false);
  });

  it("knows whether a start is still open, including one a reservation just took", async () => {
    const free = availability();
    const taken = availability([], [["2026-11-17T09:00:00.000Z", "2026-11-17T09:30:00.000Z"]]);

    expect(await free.subject.isOpen(LINK, NOW, new Date("2026-11-17T09:00:00.000Z"))).toBe(true);
    expect(await taken.subject.isOpen(LINK, NOW, new Date("2026-11-17T09:00:00.000Z"))).toBe(false);
    expect(await free.subject.isOpen(LINK, NOW, new Date("2026-11-17T09:15:00.000Z"))).toBe(false);
    expect(await free.subject.isOpen(LINK, NOW, new Date("2026-12-31T09:00:00.000Z"))).toBe(false);
  });

  describe("several hosts", () => {
    const DAY_START = new Date("2026-11-17T00:00:00.000Z");
    const NINE: [string, string] = ["2026-11-17T08:00:00.000Z", "2026-11-17T10:00:00.000Z"];

    it("reads each host's busy time as that host and offers a time when any host is free", async () => {
      const { subject, busy } = perHost({ a: [NINE], b: [["2026-11-17T08:00:00.000Z", "2026-11-17T09:00:00.000Z"]] });

      const one = await subject.slots(LINK, ["a"], NOW, DAY_START, 1);
      const both = await subject.slots(LINK, ["a", "b"], NOW, DAY_START, 1);
      const starts = (page: typeof one) => page.slots.map((slot) => slot.startsAt.slice(11, 16));

      expect(starts(one)).not.toContain("09:00");
      expect(starts(both)).toContain("09:00");
      expect(starts(both)).not.toContain("08:00");
      expect(new Set(starts(both)).size).toBe(both.slots.length);
      expect(busy.read).toHaveBeenCalledTimes(3);
    });

    it("leaves out a host who cannot be run as, without failing the page", async () => {
      const busy = { read: vi.fn().mockResolvedValue([]) };
      const reservations = { busyForOwner: vi.fn().mockResolvedValue([]) };
      const subject = new BookingAvailability(busy as never, reservations as never, (userId, work) =>
        userId === "gone" ? Promise.resolve(null) : runAs(userId, work),
      );

      expect((await subject.slots(LINK, ["gone"], NOW, DAY_START, 1)).slots).toEqual([]);
      expect((await subject.slots(LINK, ["gone", "a"], NOW, DAY_START, 1)).slots.length).toBeGreaterThan(0);
      expect(await subject.openHosts(LINK, ["gone", "a"], NOW, new Date("2026-11-17T09:00:00.000Z"))).toEqual(["a"]);
    });

    it("names the hosts who are free at a start, in the order given", async () => {
      const { subject } = perHost(
        { a: [NINE], c: [] },
        { b: [["2026-11-17T09:00:00.000Z", "2026-11-17T09:30:00.000Z"]] },
      );

      expect(await subject.openHosts(LINK, ["c", "a", "b"], NOW, new Date("2026-11-17T09:00:00.000Z"))).toEqual(["c"]);
      expect(await subject.openHosts(LINK, ["a", "b", "c"], NOW, new Date("2026-11-17T11:00:00.000Z"))).toEqual([
        "a",
        "b",
        "c",
      ]);
    });
  });

  describe("moving an own booking", () => {
    const AT = new Date("2026-11-17T09:00:00.000Z");
    const OWN = { bookingId: "booking-1", calendarEventId: "event-1" };

    it("does not count the booking's own event as busy and leaves the booking out of the reserved times", async () => {
      const { subject, reservations } = availability([
        ["2026-11-17T09:00:00.000Z", "2026-11-17T09:30:00.000Z", "event-1"],
      ]);

      expect(await subject.isOpen(LINK, NOW, AT)).toBe(false);
      expect(await subject.isOpen(LINK, NOW, AT, OWN)).toBe(true);
      expect(reservations.busyForOwner).toHaveBeenLastCalledWith(expect.any(Date), expect.any(Date), "booking-1");

      const page = await subject.slots(LINK, [HOST], NOW, new Date("2026-11-17T00:00:00.000Z"), 1, OWN);
      expect(page.slots.map((slot) => slot.startsAt)).toContain(AT.toISOString());
    });

    it("still counts other events at that time", async () => {
      const { subject } = availability([["2026-11-17T09:00:00.000Z", "2026-11-17T09:30:00.000Z", "event-2"]]);

      expect(await subject.isOpen(LINK, NOW, AT, OWN)).toBe(false);
    });
  });
});
