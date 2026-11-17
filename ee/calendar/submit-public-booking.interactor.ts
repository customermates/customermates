import type { EventService } from "@/features/event/event.service";
import type { FormSubmittedPayload } from "@/features/event/external-trigger-events";
import type { RecordRef } from "@/features/records/record-model.schema";

import * as ErrorReporter from "@/core/observability/server";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { looksAutomated, visitorHash } from "@/core/network/public-submit-guard";
import { stripControlCharacters } from "@/core/utils/strip-control-characters";
import { DomainEvent } from "@/features/event/domain-events";
import { coerceAnswers } from "@/features/records/record-value-coercion";

import type { BookingAvailability } from "./booking-availability";
import type { BookingReservationRepo } from "./booking-reservation.repo";
import type { CalendarEventLinkRepo } from "./calendar-event-link.repo";
import type { CalendarEventWriter } from "./calendar-event-writer";
import type { WritableCalendarRow } from "./calendar-write-access.repo";
import type { MeetingRecordService } from "./meeting-record.service";
import type { PublicBookingAccess } from "./public-booking-access";
import type { BookingLinkLookup } from "./booking-link.repo";

import {
  type PublicBookingSubmitResult,
  type SubmitPublicBookingData,
  BOOKING_OPEN_PER_EMAIL,
  BOOKING_PER_LINK_PER_DAY,
  BOOKING_PER_VISITOR_PER_HOUR,
  SubmitPublicBookingSchema,
} from "./booking.schema";
import { bookingInvitation } from "./booking-invitation";
import { publicQuestions } from "./public-booking-questions";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const OPEN_BOOKINGS_RETRY_SECONDS = 3600;
const VISITOR_RETRY_SECONDS = 600;
const LINK_RETRY_SECONDS = 3600;

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

function withoutControlCharacters(answers: SubmitPublicBookingData["answers"]): SubmitPublicBookingData["answers"] {
  return Object.fromEntries(
    Object.entries(answers).map(([fieldId, value]) => [
      fieldId,
      typeof value === "string"
        ? stripControlCharacters(value)
        : Array.isArray(value)
          ? value.map(stripControlCharacters)
          : value,
    ]),
  );
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
    if (!parsed.success) {
      return {
        status: "invalid",
        fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))],
      };
    }
    if (parsed.data.website.trim()) return { status: "unavailable" };
    const name = stripControlCharacters(parsed.data.name).trim();
    if (!name) return { status: "invalid", fields: ["name"] };
    const data = { ...parsed.data, name, answers: withoutControlCharacters(parsed.data.answers) };

    return this.access.open(data.token, data.visitor, (link) => this.book(link, data));
  }

  private async book(link: BookingLinkLookup, data: SubmitPublicBookingData): Promise<PublicBookingSubmitResult> {
    const now = this.access.now();
    const startsAt = new Date(data.startsAt);
    const automated = looksAutomated({
      honeypot: data.website,
      renderToken: data.renderToken,
      subjectId: link.id,
      now,
      authSecret: this.access.authSecret,
    });
    if (automated) return { status: "unavailable" };
    if (!(await this.availability.isOpen(link, now, startsAt))) return { status: "slotTaken" };

    const model = link.recordTypeId ? await this.records.loadModel() : null;
    const questions = publicQuestions(model, link);
    const answers = coerceAnswers(questions, link.recordTypeId ?? "", model?.fields ?? [], data.answers);
    const invalid = Object.keys(answers.errors);
    if (invalid.length) return { status: "invalid", fields: invalid };
    if ((await this.reservations.countOpenForEmail(link.id, data.email, now)) >= BOOKING_OPEN_PER_EMAIL)
      return { status: "rateLimited", retryAfterSeconds: OPEN_BOOKINGS_RETRY_SECONDS };
    const ipHash = visitorHash(data.visitor, this.access.authSecret);
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    if (
      ipHash &&
      (await this.reservations.countForVisitorSince(link.id, ipHash, hourAgo)) >= BOOKING_PER_VISITOR_PER_HOUR
    )
      return { status: "rateLimited", retryAfterSeconds: VISITOR_RETRY_SECONDS };
    const dayAgo = new Date(now.getTime() - DAY_MS);
    if ((await this.reservations.countForLinkSince(link.id, dayAgo)) >= BOOKING_PER_LINK_PER_DAY)
      return { status: "rateLimited", retryAfterSeconds: LINK_RETRY_SECONDS };

    const endsAt = new Date(startsAt.getTime() + link.durationMinutes * MINUTE_MS);
    const reservation = await this.reservations.reserve(
      {
        bookingLinkId: link.id,
        startsAt,
        endsAt,
        inviteeName: data.name,
        inviteeEmail: data.email,
        timeZone: data.timeZone,
        answers: answers.display,
        ipHash,
      },
      () => this.availability.isOpen(link, this.access.now(), startsAt),
    );
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
    const invitation = bookingInvitation(link.title, data.name, data.email);
    const written = await this.writer.create(link.companyId, calendar, {
      title: invitation.title,
      description: invitation.description,
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
            answers: answers.fields,
            identities: answers.identities,
            person: person ? { ref: person, relationshipId: link.personRelationshipId } : null,
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
          ...answers.display,
        },
      };
      await safely("booking-form-submitted", () =>
        this.events.publish(
          DomainEvent.FORM_SUBMITTED,
          { entityId: reservation.id, payload },
          { systemCompanyId: link.companyId },
        ),
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
