import type { BusyInterval } from "./free-slots";

export type BookingReservationInput = {
  bookingLinkId: string;
  startsAt: Date;
  endsAt: Date;
  inviteeName: string;
  inviteeEmail: string;
  timeZone: string;
  answers: Record<string, string | number | boolean>;
  ipHash: string | null;
};

export type BookingConfirmation = {
  calendarEventId: string;
  personTypeId: string | null;
  personRecordId: string | null;
  recordTypeId: string | null;
  recordId: string | null;
};

export abstract class BookingReservationRepo {
  abstract reserve(input: BookingReservationInput, isOpen: () => Promise<boolean>): Promise<{ id: string } | null>;
  abstract confirm(id: string, confirmation: BookingConfirmation): Promise<void>;
  abstract release(id: string): Promise<void>;
  abstract cancelForCalendarEvent(calendarEventId: string): Promise<void>;
  abstract cancelForCalendarEventUnscoped(args: {
    companyId: string;
    calendarEventId: string;
    stillAt?: { startsAt: Date; endsAt: Date };
  }): Promise<number>;
  abstract busyForOwner(from: Date, to: Date): Promise<BusyInterval[]>;
  abstract countOpenForEmail(bookingLinkId: string, email: string, now: Date): Promise<number>;
  abstract countForVisitorSince(bookingLinkId: string, ipHash: string, since: Date): Promise<number>;
  abstract countForLinkSince(bookingLinkId: string, since: Date): Promise<number>;
  abstract deleteExpiredUnscoped(cutoffs: { endedBefore: Date; abandonedBefore: Date }, limit: number): Promise<number>;
}
