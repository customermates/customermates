import type { EventService } from "@/features/event/event.service";
import type { FormSubmittedPayload } from "@/features/event/external-trigger-events";
import type { RecordRef } from "@/features/records/record-model.schema";

import * as ErrorReporter from "@/core/observability/server";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { DomainEvent } from "@/features/event/domain-events";

import type { BookingAvailability } from "./booking-availability";
import type { BookingReservationRepo } from "./booking-reservation.repo";
import type { CalendarEventLinkRepo } from "./calendar-event-link.repo";
import type { CalendarEventWriter } from "./calendar-event-writer";
import type { WritableCalendarRow } from "./calendar-write-access.repo";
import type { MeetingRecordService } from "./meeting-record.service";
import type { PublicBookingAccess } from "./public-booking-access";
import type { BookingLinkLookup } from "./booking-link.repo";

import { type PublicBookingSubmitResult, type SubmitPublicBookingData, BOOKING_OPEN_PER_EMAIL, SubmitPublicBookingSchema } from "./booking.schema";
import { checkBookingAnswers, describeBookingAnswers } from "./booking-answers";
import { publicQuestions } from "./public-booking-questions";

const MINUTE_MS = 60_000;
const OPEN_BOOKINGS_RETRY_SECONDS = 3600;

async function safely<T>(kind: string, work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    ErrorReporter.captureException(error, { tags: { kind } });
    return null;
  }
}

function isRef(value: RecordRef | null): value is RecordRef {
  return value !== null;
}

@SystemInteractor
export class SubmitPublicBookingInteractor {
  constructor(
    private access: PublicBookingAccess,
    private availability: BookingAvailability,
    private reservations: BookingReservationRepo,
    private writer: CalendarEventWriter,
    private links: CalendarEventLinkRepo,
    private records: MeetingRecordService,
    private events: Pick<EventService, "publish">,
  ) {}

  async invoke(input: unknown): Promise<PublicBookingSubmitResult> {
    const parsed = SubmitPublicBookingSchema.safeParse(input);
    if (!parsed.success)
      return { status: "invalid", fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))] };
    if (parsed.data.website.trim()) return { status: "invalid", fields: ["website"] };

    return this.access.open(parsed.data.token, parsed.data.visitor, (link) => this.book(link, parsed.data));
  }

  private async book(link: BookingLinkLookup, data: SubmitPublicBookingData): Promise<PublicBookingSubmitResult> {
    const now = new Date();
    const startsAt = new Date(data.startsAt);
    if (!(await this.availability.isOpen(link, now, startsAt))) return { status: "slotTaken" };

    const questions = publicQuestions(link.recordTypeId ? await this.records.loadModel() : null, link);
    const checked = checkBookingAnswers(questions, data.answers);
    if (checked.invalid.length) return { status: "invalid", fields: checked.invalid };
    if ((await this.reservations.countOpenForEmail(link.id, data.email, now)) >= BOOKING_OPEN_PER_EMAIL)
      return { status: "rateLimited", retryAfterSeconds: OPEN_BOOKINGS_RETRY_SECONDS };

    const endsAt = new Date(startsAt.getTime() + link.durationMinutes * MINUTE_MS);
    const reservation = await this.reservations.reserve({
      bookingLinkId: link.id,
      startsAt,
      endsAt,
      inviteeName: data.name,
      inviteeEmail: data.email,
      timeZone: data.timeZone,
      answers: Object.fromEntries(checked.values.map(({ fieldId, value }) => [fieldId, value])),
      ipHash: data.visitor ?? null,
    });
    if (!reservation) return { status: "slotTaken" };

    const calendar: WritableCalendarRow = {
      id: link.calendarId,
      name: link.calendarName ?? "",
      unipileCalendarId: link.unipileCalendarId,
      timezone: null,
      provider: link.provider as WritableCalendarRow["provider"],
      connectedAccountId: link.connectedAccountId,
      unipileAccountId: link.unipileAccountId,
      accountStatus: "ok",
      accountLabel: null,
    };
    const description = [
      `${data.name} <${data.email}>`,
      ...describeBookingAnswers(questions, checked.values).map((answer) => `${answer.label}: ${answer.text}`),
    ].join("\n");
    const written = await this.writer.create(link.companyId, calendar, {
      title: `${link.title} - ${data.name}`,
      description,
      attendeeEmails: [data.email],
      startsAt,
      endsAt,
      timeZone: link.timeZone,
      videoLink: link.withVideo,
      notifyAttendees: true,
    });
    if (!written.ok) {
      await this.reservations.release(reservation.id);
      return { status: "unavailable" };
    }

    const person = link.personTypeId
      ? await safely("booking-person", () =>
          this.records.findOrCreatePerson({ typeId: link.personTypeId as string, email: data.email, name: data.name }),
        )
      : null;
    const record = link.recordTypeId
      ? await safely("booking-record", () =>
          this.records.createBookingRecord({
            typeId: link.recordTypeId as string,
            title: `${data.name} - ${link.title}`,
            startFieldId: link.startFieldId,
            startsAt,
            timeZone: link.timeZone,
            answers: checked.values,
            links: person ? [person] : [],
          }),
        )
      : null;
    const refs = [person, record].filter(isRef);
    await safely("booking-links", () => this.links.linkRecords(written.eventId, refs));

    await this.reservations.confirm(reservation.id, {
      calendarEventId: written.eventId,
      personTypeId: person?.typeId ?? null,
      personRecordId: person?.recordId ?? null,
      recordTypeId: record?.typeId ?? null,
      recordId: record?.recordId ?? null,
    });

    const typeId = link.recordTypeId ?? link.personTypeId;
    if (typeId) {
      const payload: FormSubmittedPayload = {
        source: "booking",
        formId: link.id,
        formName: link.title,
        typeId,
        submissionId: reservation.id,
        outcome: "created",
        recordId: record?.recordId ?? null,
        personRecordId: person?.recordId ?? null,
        answers: {
          name: data.name,
          email: data.email,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          timeZone: data.timeZone,
          ...Object.fromEntries(checked.values.map(({ fieldId, value }) => [fieldId, String(value)])),
        },
      };
      await safely("booking-form-submitted", () =>
        this.events.publish(DomainEvent.FORM_SUBMITTED, { entityId: reservation.id, payload }, { systemCompanyId: link.companyId }),
      );
    }

    return {
      status: "booked",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      conferenceUrl: written.event.conferenceUrl,
      title: link.title,
      successMessage: link.successMessage,
    };
  }
}
