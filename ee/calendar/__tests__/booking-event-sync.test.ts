import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const reporter = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/observability/server", () => reporter);

import { getTenantUser, runWithTenant } from "@/core/decorators/tenant-context";
import { DomainEvent } from "@/features/event/domain-events";

import type { BookingMove, BookingRow } from "../booking-reservation.repo";

import { BOOKING_PANEL_HREF, BookingAnnouncer, bookingChangedPayload, bookingWhen } from "../booking-announcer";
import { BookingEventSync } from "../booking-event-sync";
import { ANA, bookingRow, EVENT_ID, OWNER } from "./public-booking-fixtures";

const NOW = new Date("2026-11-18T10:00:00.000Z");
const LATER = { startsAt: new Date("2026-11-21T10:00:00.000Z"), endsAt: new Date("2026-11-21T10:30:00.000Z") };
const RECORD_TYPE = "10000000-0000-4000-8000-000000000002";
const RECORD_ID = "40000000-0000-4000-8000-000000000002";
const START_FIELD = "20000000-0000-4000-8000-000000000002";

beforeEach(() => vi.clearAllMocks());

describe("BookingEventSync", () => {
  function sync(options: { cancelled?: BookingRow[]; moves?: BookingMove[]; runAs?: boolean } = {}) {
    const bookings = {
      cancelForCalendarEventUnscoped: vi.fn().mockResolvedValue(options.cancelled ?? []),
      moveForCalendarEventUnscoped: vi.fn().mockResolvedValue(options.moves ?? []),
    };
    const announcer = { changed: vi.fn().mockResolvedValue(undefined) };
    const ranAs: string[] = [];
    const records = {
      moveBookingRecord: vi.fn(() => {
        ranAs.push(getTenantUser().id);
        return Promise.resolve(true);
      }),
    };
    const runAs = <T>(userId: string, work: () => Promise<T>): Promise<T | null> =>
      options.runAs === false ? Promise.resolve(null) : runWithTenant(createMockUser({ id: userId }), work);
    const mailer = { send: vi.fn().mockResolvedValue(true) };
    return {
      bookings,
      announcer,
      records,
      ranAs,
      mailer,
      subject: new BookingEventSync(bookings, announcer, records, runAs, mailer, () => NOW),
    };
  }

  const EVENT = { companyId: OWNER.companyId, calendarEventId: EVENT_ID };

  it("cancels the bookings of a cancelled event as the host's doing and announces each", async () => {
    const first = bookingRow({ status: "cancelled" });
    const second = bookingRow({ id: "booking-2", status: "cancelled", hostUserId: ANA.id });
    const { subject, bookings, announcer, mailer } = sync({ cancelled: [first, second] });

    expect(await subject.eventCancelled(EVENT)).toBe(2);

    expect(bookings.cancelForCalendarEventUnscoped).toHaveBeenCalledWith({ ...EVENT, now: NOW });
    expect(announcer.changed.mock.calls).toEqual([
      [first, "cancelled", "host"],
      [second, "cancelled", "host"],
    ]);
    expect(mailer.send.mock.calls).toEqual([
      [{ kind: "cancelled", booking: first, by: "host", reason: null }],
      [{ kind: "cancelled", booking: second, by: "host", reason: null }],
    ]);
  });

  it("announces nothing when the event had no open booking", async () => {
    const { subject, announcer } = sync();

    expect(await subject.eventCancelled(EVENT)).toBe(0);
    expect(await subject.eventAt({ ...EVENT, ...LATER })).toBe(0);
    expect(announcer.changed).not.toHaveBeenCalled();
  });

  it("moves the bookings of a moved event, moves the record's start as the host, and announces the old start", async () => {
    const previous = new Date("2026-11-20T09:00:00.000Z");
    const booking = bookingRow({
      ...LATER,
      hostUserId: ANA.id,
      recordTypeId: RECORD_TYPE,
      recordId: RECORD_ID,
      linkStartFieldId: START_FIELD,
    });
    const { subject, bookings, records, announcer, ranAs, mailer } = sync({
      moves: [{ booking, previousStartsAt: previous }],
    });

    expect(await subject.eventAt({ ...EVENT, ...LATER })).toBe(1);

    expect(bookings.moveForCalendarEventUnscoped).toHaveBeenCalledWith({ ...EVENT, ...LATER, now: NOW });
    expect(records.moveBookingRecord).toHaveBeenCalledWith({
      ref: { typeId: RECORD_TYPE, recordId: RECORD_ID },
      startFieldId: START_FIELD,
      startsAt: LATER.startsAt,
      timeZone: "Europe/Berlin",
    });
    expect(ranAs).toEqual([ANA.id]);
    expect(announcer.changed).toHaveBeenCalledWith(booking, "rescheduled", "host", { previousStartsAt: previous });
    expect(mailer.send).toHaveBeenCalledWith({
      kind: "rescheduled",
      booking,
      by: "host",
      previousStartsAt: previous,
    });
  });

  it("moves no record for a booking without one and still announces when the record cannot be moved", async () => {
    const plain = bookingRow({ ...LATER });
    const withRecord = bookingRow({ id: "booking-2", ...LATER, recordTypeId: RECORD_TYPE, recordId: RECORD_ID });
    const { subject, records, announcer } = sync({
      moves: [
        { booking: plain, previousStartsAt: NOW },
        { booking: withRecord, previousStartsAt: NOW },
      ],
    });
    records.moveBookingRecord.mockRejectedValueOnce(new Error("boom"));

    expect(await subject.eventAt({ ...EVENT, ...LATER })).toBe(2);

    expect(records.moveBookingRecord).toHaveBeenCalledTimes(1);
    expect(reporter.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { kind: "booking-record-move" },
    });
    expect(announcer.changed).toHaveBeenCalledTimes(2);
  });

  it("skips the record of a host who is no longer an active member", async () => {
    const booking = bookingRow({ ...LATER, recordTypeId: RECORD_TYPE, recordId: RECORD_ID });
    const { subject, records, announcer } = sync({ moves: [{ booking, previousStartsAt: NOW }], runAs: false });

    expect(await subject.eventAt({ ...EVENT, ...LATER })).toBe(1);
    expect(records.moveBookingRecord).not.toHaveBeenCalled();
    expect(announcer.changed).toHaveBeenCalledTimes(1);
  });
});

describe("BookingAnnouncer", () => {
  function announcer() {
    const events = { publish: vi.fn().mockResolvedValue(undefined) };
    const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
    const copy = vi.fn((locale: string, kind: string) =>
      Promise.resolve({ title: `${locale}:${kind}:title`, body: `${locale}:${kind}:body` }),
    );
    return { events, notifications, copy, subject: new BookingAnnouncer(events, notifications, copy) };
  }

  it("publishes booking.changed for the booking's company with the change payload", async () => {
    const { subject, events } = announcer();
    const booking = bookingRow({ personTypeId: "people", personRecordId: "person-1" });

    await subject.changed(booking, "rescheduled", "invitee", { previousStartsAt: NOW });

    expect(events.publish).toHaveBeenCalledWith(
      DomainEvent.BOOKING_CHANGED,
      {
        entityId: booking.id,
        payload: bookingChangedPayload(booking, "rescheduled", "invitee", { previousStartsAt: NOW }),
      },
      { systemCompanyId: OWNER.companyId },
    );
    expect(events.publish.mock.calls[0]?.[1].payload).toMatchObject({
      by: "invitee",
      change: "rescheduled",
      hostUserId: OWNER.id,
      typeId: "people",
      recordId: "person-1",
      answers: { previousStartsAt: NOW.toISOString() },
    });
  });

  it("reports a failed publish instead of failing the change", async () => {
    const { subject, events } = announcer();
    events.publish.mockRejectedValue(new Error("down"));

    await expect(subject.changed(bookingRow(), "cancelled", "host")).resolves.toBeUndefined();
    expect(reporter.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { kind: "booking-changed-event" },
    });
  });

  it("tells the host and the page owner once, in the given locale, with the time in the page's time zone", async () => {
    const { subject, notifications, copy } = announcer();
    const booking = bookingRow({ hostUserId: ANA.id });

    await subject.notifyHost(booking, "cancelled", "de", "Ill");

    expect(copy).toHaveBeenCalledWith("de", "cancelled", {
      name: "Ada Lovelace",
      page: "Intro call",
      when: bookingWhen(booking.startsAt, "de", "Europe/Berlin"),
      reason: "Ill",
    });
    expect(notifications.notify).toHaveBeenCalledWith({
      companyId: OWNER.companyId,
      recipients: [ANA.id, OWNER.id],
      kind: "ruleAlert",
      title: "de:cancelled:title",
      body: "de:cancelled:body",
      href: BOOKING_PANEL_HREF,
      dedupeKey: `booking:${booking.id}:cancelled:${booking.startsAt.toISOString()}`,
    });
  });

  it("names the owner once when the owner hosts the booking", async () => {
    const { subject, notifications } = announcer();

    await subject.notifyHost(bookingRow(), "booked", "en");

    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ recipients: [OWNER.id] }));
  });

  it("gives every move of a booking its own notice", async () => {
    const { subject, notifications } = announcer();

    await subject.notifyHost(bookingRow(), "rescheduled", "en");
    await subject.notifyHost(bookingRow(LATER), "rescheduled", "en");

    const keys = notifications.notify.mock.calls.map(([notice]) => (notice as { dedupeKey: string }).dedupeKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("reports a failed notice instead of failing the change", async () => {
    const { subject, notifications } = announcer();
    notifications.notify.mockRejectedValue(new Error("down"));

    await expect(subject.notifyHost(bookingRow(), "booked", "en")).resolves.toBeUndefined();
    expect(reporter.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { kind: "booking-host-notice" },
    });
  });

  it("formats the time in the locale and time zone given", () => {
    const at = new Date("2026-11-20T09:00:00.000Z");

    expect(bookingWhen(at, "en", "Europe/Berlin")).toContain("10:00");
    expect(bookingWhen(at, "en", "America/New_York")).toContain("4:00");
    expect(bookingWhen(at, "de", "Europe/Berlin")).toContain("Freitag");
  });
});
