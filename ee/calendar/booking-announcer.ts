import type { AppLocale } from "@/i18n/locale-registry";
import type { EventService } from "@/features/event/event.service";
import type { BookingChange, BookingChangedPayload } from "@/features/event/external-trigger-events";
import type { NotificationService } from "@/features/notifications/notification.service";

import * as ErrorReporter from "@/core/observability/server";

import { DomainEvent } from "@/features/event/domain-events";

import type { BookingRow } from "./booking-reservation.repo";

export const BOOKING_PANEL_HREF = "/calendar?panel=booking";

export type BookingNoticeKind = "booked" | BookingChange;

export type BookingNoticeValues = { name: string; page: string; when: string; reason: string | null };

export type BookingNoticeCopy = (
  locale: AppLocale,
  kind: BookingNoticeKind,
  values: BookingNoticeValues,
) => Promise<{ title: string; body: string }>;

export type BookingChangeDetails = { previousStartsAt?: Date; reason?: string | null };

export function bookingChangedPayload(
  booking: BookingRow,
  change: BookingChange,
  by: "invitee" | "host",
  details: BookingChangeDetails = {},
): BookingChangedPayload {
  return {
    bookingId: booking.id,
    bookingLinkId: booking.bookingLinkId,
    bookingLinkName: booking.linkTitle,
    change,
    by,
    typeId: booking.recordTypeId ?? booking.personTypeId,
    recordId: booking.recordTypeId ? booking.recordId : booking.personRecordId,
    personRecordId: booking.personRecordId,
    hostUserId: booking.hostUserId,
    answers: {
      ...booking.answers,
      name: booking.inviteeName,
      email: booking.inviteeEmail,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      timeZone: booking.timeZone,
      ...(details.previousStartsAt ? { previousStartsAt: details.previousStartsAt.toISOString() } : {}),
      ...(details.reason ? { reason: details.reason } : {}),
    },
  };
}

export function bookingWhen(startsAt: Date, locale: AppLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone }).format(startsAt);
}

export class BookingAnnouncer {
  constructor(
    private events: Pick<EventService, "publish">,
    private notifications: Pick<NotificationService, "notify">,
    private copy: BookingNoticeCopy,
  ) {}

  async changed(
    booking: BookingRow,
    change: BookingChange,
    by: "invitee" | "host",
    details: BookingChangeDetails = {},
  ): Promise<void> {
    try {
      await this.events.publish(
        DomainEvent.BOOKING_CHANGED,
        { entityId: booking.id, payload: bookingChangedPayload(booking, change, by, details) },
        { systemCompanyId: booking.companyId },
      );
    } catch (error) {
      ErrorReporter.captureException(error, { tags: { kind: "booking-changed-event" } });
    }
  }

  async notifyHost(
    booking: Pick<
      BookingRow,
      "id" | "companyId" | "hostUserId" | "linkOwnerId" | "inviteeName" | "linkTitle" | "startsAt" | "linkTimeZone"
    >,
    kind: BookingNoticeKind,
    locale: AppLocale,
    reason: string | null = null,
  ): Promise<void> {
    try {
      const { title, body } = await this.copy(locale, kind, {
        name: booking.inviteeName,
        page: booking.linkTitle,
        when: bookingWhen(booking.startsAt, locale, booking.linkTimeZone),
        reason,
      });
      await this.notifications.notify({
        companyId: booking.companyId,
        recipients: [...new Set([booking.hostUserId, booking.linkOwnerId])],
        kind: "ruleAlert",
        title,
        body,
        href: BOOKING_PANEL_HREF,
        dedupeKey: `booking:${booking.id}:${kind}:${booking.startsAt.toISOString()}`,
      });
    } catch (error) {
      ErrorReporter.captureException(error, { tags: { kind: "booking-host-notice" } });
    }
  }
}
