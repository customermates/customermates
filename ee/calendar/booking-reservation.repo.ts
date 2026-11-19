import type { StoredBrand } from "@/features/workspace-brand/workspace-brand.repo";
import type { BusyInterval } from "./free-slots";

export type BookingReservationInput = {
  bookingLinkId: string;
  manageToken: string;
  startsAt: Date;
  endsAt: Date;
  inviteeName: string;
  inviteeEmail: string;
  timeZone: string;
  answers: Record<string, string | number | boolean>;
  ipHash: string | null;
  locale?: string | null;
};

export type BookingTimes = {
  startsAt: Date;
  endsAt: Date;
  rescheduledAt?: Date | null;
  reminderSentAt?: Date | null;
};

export type BookingConfirmation = {
  calendarEventId: string;
  personTypeId: string | null;
  personRecordId: string | null;
  recordTypeId: string | null;
  recordId: string | null;
};

export type BookingRow = {
  id: string;
  companyId: string;
  bookingLinkId: string;
  linkToken: string;
  linkTitle: string;
  linkOwnerId: string;
  linkTimeZone: string;
  linkRecordTypeId: string | null;
  linkPersonTypeId: string | null;
  linkStartFieldId: string | null;
  calendarEventId: string | null;
  status: "reserved" | "confirmed" | "cancelled";
  inviteeName: string;
  inviteeEmail: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  answers: Record<string, string>;
  personTypeId: string | null;
  personRecordId: string | null;
  recordTypeId: string | null;
  recordId: string | null;
  hostUserId: string;
  hostName: string;
  hostEmail: string;
  manageToken: string;
  linkInviteeChanges: boolean;
  workspaceName: string | null;
  brand: StoredBrand | null;
  locale: string | null;
  cancelledBy: "invitee" | "host" | null;
  cancelReason: string | null;
  rescheduledAt: Date | null;
  reminderSentAt: Date | null;
};

export type BookingMove = { booking: BookingRow; previousStartsAt: Date };

export type HostLoad = { hostUserId: string; upcoming: number; lastBookedAt: Date | null };

export abstract class BookingReservationRepo {
  abstract reserve(input: BookingReservationInput, isOpen: () => Promise<boolean>): Promise<{ id: string } | null>;
  abstract confirm(id: string, confirmation: BookingConfirmation): Promise<BookingRow | null>;
  abstract release(id: string): Promise<void>;
  abstract findByManageTokenUnscoped(manageToken: string): Promise<BookingRow | null>;
  abstract findConfirmed(id: string): Promise<BookingRow | null>;
  abstract cancelHosted(
    id: string,
    by: "invitee" | "host",
    reason: string | null,
    now: Date,
  ): Promise<BookingRow | null>;
  abstract reopenHosted(id: string): Promise<void>;
  abstract moveHosted(
    id: string,
    to: { startsAt: Date; endsAt: Date },
    now: Date,
    isOpen: () => Promise<boolean>,
  ): Promise<BookingMove | null>;
  abstract restoreTimes(id: string, times: BookingTimes): Promise<void>;
  abstract listDueRemindersUnscoped(now: Date, limit: number): Promise<BookingRow[]>;
  abstract claimReminderUnscoped(
    booking: Pick<BookingRow, "id" | "companyId" | "startsAt">,
    now: Date,
  ): Promise<boolean>;
  abstract releaseReminderUnscoped(booking: Pick<BookingRow, "id" | "companyId">): Promise<void>;
  abstract cancelForCalendarEventUnscoped(args: {
    companyId: string;
    calendarEventId: string;
    now: Date;
  }): Promise<BookingRow[]>;
  abstract moveForCalendarEventUnscoped(args: {
    companyId: string;
    calendarEventId: string;
    startsAt: Date;
    endsAt: Date;
    now: Date;
  }): Promise<BookingMove[]>;
  abstract busyForOwner(from: Date, to: Date, exceptBookingId?: string): Promise<BusyInterval[]>;
  abstract hostLoads(bookingLinkId: string, now: Date): Promise<HostLoad[]>;
  abstract listUpcoming(now: Date, scope: "hosted" | "workspace", limit: number): Promise<BookingRow[]>;
  abstract countOpenForEmail(bookingLinkId: string, email: string, now: Date): Promise<number>;
  abstract countForVisitorSince(bookingLinkId: string, ipHash: string, since: Date): Promise<number>;
  abstract countForLinkSince(bookingLinkId: string, since: Date): Promise<number>;
  abstract deleteExpiredUnscoped(cutoffs: { endedBefore: Date; abandonedBefore: Date }, limit: number): Promise<number>;
}
