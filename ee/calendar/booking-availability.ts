import type { BookingReservationRepo } from "./booking-reservation.repo";
import type { BookingLinkRow } from "./booking.schema";
import type { BusyTimeReader } from "./busy-time.reader";
import type { FreeSlot, FreeSlotRules } from "./free-slots";

import { storedWorkingHours } from "./booking-link-dto";
import { computeFreeSlots, freeSlotWindow, isFreeSlot } from "./free-slots";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const SLOT_LIMIT = 500;
const BUSY_WINDOW_DAYS = 31;

export type BookingSlotPage = { slots: FreeSlot[]; nextFrom: string | null };

export function bookingRules(link: BookingLinkRow): FreeSlotRules {
  return {
    workingHours: storedWorkingHours(link.workingHours),
    timeZone: link.timeZone,
    durationMinutes: link.durationMinutes,
    bufferMinutes: link.bufferMinutes,
    minNoticeMinutes: link.minNoticeMinutes,
    horizonDays: link.horizonDays,
    stepMinutes: Math.min(30, link.durationMinutes),
  };
}

export class BookingAvailability {
  constructor(
    private busy: BusyTimeReader,
    private reservations: Pick<BookingReservationRepo, "busyForOwner">,
  ) {}

  async slots(link: BookingLinkRow, now: Date, from?: Date, days?: number): Promise<BookingSlotPage> {
    const rules = bookingRules(link);
    const bounds = freeSlotWindow(rules, now);
    const start = from && from > bounds.earliest ? from : bounds.earliest;
    const end = new Date(Math.min(bounds.latest.getTime(), start.getTime() + (days ?? 14) * DAY_MS));
    if (start >= end) return { slots: [], nextFrom: null };

    const busy = await this.busyBetween(start, end, link);
    const found = computeFreeSlots({ rules, now, busy, from: start, to: end, limit: SLOT_LIMIT + 1 });
    const overflow = found[SLOT_LIMIT];
    const covered = overflow ? new Date(overflow.startsAt) : new Date(end.getTime() + 1);

    return {
      slots: overflow ? found.slice(0, SLOT_LIMIT) : found,
      nextFrom: covered <= bounds.latest ? covered.toISOString() : null,
    };
  }

  async isOpen(link: BookingLinkRow, now: Date, startsAt: Date): Promise<boolean> {
    const rules = bookingRules(link);
    const margin = (link.bufferMinutes + link.durationMinutes) * MINUTE_MS + DAY_MS;
    const busy = await this.busyBetween(
      new Date(startsAt.getTime() - margin),
      new Date(startsAt.getTime() + margin),
      link,
    );

    return isFreeSlot({ rules, now, busy }, startsAt);
  }

  async busyTimeIncomplete(links: BookingLinkRow[], now: Date): Promise<boolean> {
    const horizonDays = Math.max(0, ...links.map((link) => link.horizonDays));
    const timeZone = links[0]?.timeZone ?? "UTC";
    for (let day = 0; day < horizonDays; day += BUSY_WINDOW_DAYS) {
      const from = new Date(now.getTime() + day * DAY_MS);
      const to = new Date(now.getTime() + Math.min(horizonDays, day + BUSY_WINDOW_DAYS) * DAY_MS);
      if ((await this.busy.window(from, to, timeZone)).truncated) return true;
    }

    return false;
  }

  private async busyBetween(from: Date, to: Date, link: BookingLinkRow) {
    const margin = link.bufferMinutes * MINUTE_MS;
    const lower = new Date(from.getTime() - margin);
    const upper = new Date(to.getTime() + margin);
    const [calendar, reserved] = await Promise.all([
      this.busy.read(lower, upper, link.timeZone),
      this.reservations.busyForOwner(lower, upper),
    ]);

    return [...calendar, ...reserved];
  }
}
