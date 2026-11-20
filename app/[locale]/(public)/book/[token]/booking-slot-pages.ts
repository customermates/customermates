import type { PublicBookingSlotsResult } from "@/ee/calendar/booking.schema";

export type BookingSlot = { startsAt: string; endsAt: string };

export type BookingSlotLoad =
  | { status: "loaded"; slots: BookingSlot[]; nextFrom: string | null; through: number }
  | { status: "failed" };

type LoadArgs = {
  read: (from: string | undefined) => Promise<PublicBookingSlotsResult>;
  from: string | null;
  through: number;
  untilFirstSlot: boolean;
};

const MAX_REQUESTS_PER_LOAD = 30;
const DAY_MS = 86_400_000;

export function bookingMonthEnd(month: Date): number {
  return new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime() + DAY_MS;
}

export function bookingHorizonEnd(now: Date, horizonDays: number): Date {
  return new Date(now.getTime() + horizonDays * DAY_MS);
}

export function needsMoreBookingSlots(nextFrom: string | null, through: number): boolean {
  return nextFrom !== null && Date.parse(nextFrom) <= through;
}

export async function loadBookingSlots({ read, from, through, untilFirstSlot }: LoadArgs): Promise<BookingSlotLoad> {
  const slots: BookingSlot[] = [];
  let nextFrom = from;
  let shownThrough = through;
  for (let request = 0; request < MAX_REQUESTS_PER_LOAD; request += 1) {
    const result = await read(nextFrom ?? undefined);
    if (result.status !== "available") return { status: "failed" };
    slots.push(...result.slots);
    nextFrom = result.nextFrom;
    if (untilFirstSlot && slots.length > 0)
      shownThrough = Math.max(shownThrough, bookingMonthEnd(new Date(slots[0].startsAt)));
    const wanted = needsMoreBookingSlots(nextFrom, shownThrough) || (untilFirstSlot && slots.length === 0);
    if (nextFrom === null || !wanted) break;
  }
  return { status: "loaded", slots, nextFrom, through: shownThrough };
}
