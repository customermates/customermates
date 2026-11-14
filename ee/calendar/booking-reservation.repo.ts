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
  abstract reserve(input: BookingReservationInput): Promise<{ id: string } | null>;
  abstract confirm(id: string, confirmation: BookingConfirmation): Promise<void>;
  abstract release(id: string): Promise<void>;
  abstract cancelForCalendarEvent(calendarEventId: string): Promise<void>;
  abstract busyForOwner(from: Date, to: Date): Promise<BusyInterval[]>;
  abstract countOpenForEmail(bookingLinkId: string, email: string, now: Date): Promise<number>;
}
