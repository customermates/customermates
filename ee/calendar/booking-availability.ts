import type { BookingReservationRepo } from "./booking-reservation.repo";
import type { BookingLinkRow } from "./booking.schema";
import type { BusyTimeReader } from "./busy-time.reader";
import type { BusyInterval, FreeSlot, FreeSlotRules } from "./free-slots";

import { storedWorkingHours } from "./booking-link-dto";
import { computeFreeSlots, freeSlotWindow, isFreeSlot } from "./free-slots";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const SLOT_LIMIT = 500;
const BUSY_WINDOW_DAYS = 31;

export type BookingSlotPage = { slots: FreeSlot[]; nextFrom: string | null };

export type HostRunner = <T>(userId: string, work: () => Promise<T>) => Promise<T | null>;

export type OwnBooking = { bookingId: string; calendarEventId: string | null };

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

export function mergeHostSlots(
  perHost: FreeSlot[][],
  windowEnd: Date,
  limit: number,
): { slots: FreeSlot[]; covered: Date } {
  let covered = new Date(windowEnd.getTime() + 1);
  for (const found of perHost) {
    const overflow = found[limit];
    if (overflow && new Date(overflow.startsAt) < covered) covered = new Date(overflow.startsAt);
  }
  const merged = new Map<string, FreeSlot>();
  for (const found of perHost)
    for (const slot of found) if (new Date(slot.startsAt) < covered) merged.set(slot.startsAt, slot);

  const slots = [...merged.values()].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  const cut = slots[limit];
  if (!cut) return { slots, covered };

  return { slots: slots.slice(0, limit), covered: new Date(cut.startsAt) };
}

export class BookingAvailability {
  constructor(
    private busy: BusyTimeReader,
    private reservations: Pick<BookingReservationRepo, "busyForOwner">,
    private runAs: HostRunner,
  ) {}

  async slots(
    link: BookingLinkRow,
    hostIds: string[],
    now: Date,
    from?: Date,
    days?: number,
    own?: OwnBooking,
  ): Promise<BookingSlotPage> {
    const rules = bookingRules(link);
    const bounds = freeSlotWindow(rules, now);
    const start = from && from > bounds.earliest ? from : bounds.earliest;
    const end = new Date(Math.min(bounds.latest.getTime(), start.getTime() + (days ?? 14) * DAY_MS));
    if (start >= end) return { slots: [], nextFrom: null };

    const perHost = await Promise.all(
      hostIds.map((hostId) =>
        this.runAs(hostId, async () =>
          computeFreeSlots({
            rules,
            now,
            busy: await this.busyBetween(start, end, link, own),
            from: start,
            to: end,
            limit: SLOT_LIMIT + 1,
          }),
        ),
      ),
    );
    const { slots, covered } = mergeHostSlots(
      perHost.map((found) => found ?? []),
      end,
      SLOT_LIMIT,
    );

    return { slots, nextFrom: covered <= bounds.latest ? covered.toISOString() : null };
  }

  async openHosts(link: BookingLinkRow, hostIds: string[], now: Date, startsAt: Date): Promise<string[]> {
    const open = await Promise.all(
      hostIds.map(async (hostId) =>
        (await this.runAs(hostId, () => this.isOpen(link, now, startsAt))) ? hostId : null,
      ),
    );

    return open.filter((hostId): hostId is string => hostId !== null);
  }

  async isOpen(link: BookingLinkRow, now: Date, startsAt: Date, own?: OwnBooking): Promise<boolean> {
    const rules = bookingRules(link);
    const margin = (link.bufferMinutes + link.durationMinutes) * MINUTE_MS + DAY_MS;
    const busy = await this.busyBetween(
      new Date(startsAt.getTime() - margin),
      new Date(startsAt.getTime() + margin),
      link,
      own,
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

  private async busyBetween(from: Date, to: Date, link: BookingLinkRow, own?: OwnBooking): Promise<BusyInterval[]> {
    const margin = link.bufferMinutes * MINUTE_MS;
    const lower = new Date(from.getTime() - margin);
    const upper = new Date(to.getTime() + margin);
    const [calendar, reserved] = await Promise.all([
      this.busy.read(lower, upper, link.timeZone),
      this.reservations.busyForOwner(lower, upper, own?.bookingId),
    ]);
    const others = own?.calendarEventId
      ? calendar.filter((interval) => interval.eventId !== own.calendarEventId)
      : calendar;

    return [...others, ...reserved];
  }
}
