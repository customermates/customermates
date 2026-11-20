import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));

import type { TenantUser } from "@/features/user/user.schema";

import { getTenantUser, runWithTenant } from "@/core/decorators/tenant-context";
import { ForbiddenError } from "@/core/errors/app-errors";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { serializeInteractorFailure } from "@/core/validation/validation.utils";

import type { BookingLinkLookup } from "../booking-link.repo";
import type { BookingMove, BookingRow } from "../booking-reservation.repo";

import { CancelHostedBookingInteractor } from "../cancel-hosted-booking.interactor";
import { GetHostedBookingSlotsInteractor } from "../get-hosted-booking-slots.interactor";
import { HostedBookingAccess } from "../hosted-booking-access";
import { RescheduleHostedBookingInteractor } from "../reschedule-hosted-booking.interactor";
import { ANA, BOOKING_ID, bookingRow, EVENT_ID, eventRow, lookupLink, OWNER } from "./public-booking-fixtures";

const NOW = new Date("2026-11-16T10:00:00.000Z");
const STARTS_AT = new Date("2026-11-20T09:00:00.000Z");
const NEW_START = "2026-11-21T10:00:00.000Z";
const NEW_END = "2026-11-21T10:30:00.000Z";
const RECORD_TYPE = "10000000-0000-4000-8000-000000000002";
const RECORD_ID = "40000000-0000-4000-8000-000000000002";
const START_FIELD = "20000000-0000-4000-8000-000000000002";

const MEMBER_PERMISSIONS = [
  { resource: Resource.inboxMessages, action: Action.readOwn },
  { resource: Resource.inboxMessages, action: Action.update },
];
const member = (id: string): TenantUser => ({ ...createMockUserWithPermissions(MEMBER_PERMISSIONS), id });
const HOST = member(ANA.id);
const PAGE_OWNER = member("page-owner");
const COLLEAGUE = member("colleague");
const READER = {
  ...createMockUserWithPermissions([{ resource: Resource.inboxMessages, action: Action.readOwn }]),
  id: ANA.id,
};
const HOSTED = bookingRow({ hostUserId: HOST.id, linkOwnerId: PAGE_OWNER.id });

type Setup = { booking?: BookingRow | null; link?: BookingLinkLookup | null; entitled?: boolean };

function build(setup: Setup = {}) {
  const booking = setup.booking === undefined ? HOSTED : setup.booking;
  const bookings = { findConfirmed: vi.fn().mockResolvedValue(booking) };
  const links = {
    findByTokenUnscoped: vi.fn().mockResolvedValue(setup.link === undefined ? lookupLink() : setup.link),
  };
  const access = new HostedBookingAccess(bookings, links);
  const ranAs: string[] = [];
  const reservations = {
    cancelHosted: vi.fn((_id: string, _by: string, reason: string | null): Promise<BookingRow | null> => {
      ranAs.push(getTenantUser().id);
      return Promise.resolve(
        booking ? { ...booking, status: "cancelled", cancelledBy: "host", cancelReason: reason } : null,
      );
    }),
    reopenHosted: vi.fn().mockResolvedValue(undefined),
    moveHosted: vi.fn(
      async (
        _id: string,
        to: { startsAt: Date; endsAt: Date },
        now: Date,
        isOpen: () => Promise<boolean>,
      ): Promise<BookingMove | null> => {
        ranAs.push(getTenantUser().id);
        if (!booking || !(await isOpen())) return null;
        return {
          booking: { ...booking, ...to, rescheduledAt: now, reminderSentAt: null },
          previousStartsAt: booking.startsAt,
        };
      },
    ),
    restoreTimes: vi.fn().mockResolvedValue(undefined),
  };
  const calendars = { findOwnEvent: vi.fn().mockResolvedValue(eventRow()) };
  const writer = {
    cancel: vi.fn().mockResolvedValue({ ok: true }),
    update: vi.fn().mockResolvedValue({ ok: true }),
  };
  const availability = {
    isOpen: vi.fn().mockResolvedValue(true),
    slots: vi.fn().mockResolvedValue({
      slots: [
        { startsAt: STARTS_AT.toISOString(), endsAt: "2026-11-20T09:30:00.000Z", hostUserIds: [HOST.id] },
        { startsAt: NEW_START, endsAt: NEW_END, hostUserIds: [HOST.id] },
      ],
      nextFrom: "2026-11-30T00:00:00.000Z",
    }),
  };
  const records = { moveBookingRecord: vi.fn().mockResolvedValue(true) };
  const announcer = { changed: vi.fn().mockResolvedValue(undefined) };
  const mailer = { send: vi.fn().mockResolvedValue(true) };
  const entitlements = { require: vi.fn().mockResolvedValue(setup.entitled === false ? { ok: false } : null) };
  const runAs = <T>(userId: string, work: () => Promise<T>): Promise<T | null> =>
    runWithTenant(createMockUser({ id: userId }), work);

  return {
    bookings,
    links,
    reservations,
    calendars,
    writer,
    availability,
    records,
    announcer,
    mailer,
    ranAs,
    cancel: new CancelHostedBookingInteractor(
      access,
      reservations,
      calendars,
      writer as never,
      announcer,
      mailer,
      runAs,
      entitlements,
      () => NOW,
    ),
    reschedule: new RescheduleHostedBookingInteractor(
      access,
      availability,
      reservations,
      calendars,
      writer as never,
      records,
      announcer,
      mailer,
      runAs,
      entitlements,
      () => NOW,
    ),
    slots: new GetHostedBookingSlotsInteractor(access, availability, entitlements, () => NOW),
  };
}

const as = <T>(user: TenantUser, work: () => Promise<T>) => runWithTenant(user, work);

function code(result: { ok: boolean; error?: unknown }) {
  return result.ok ? null : serializeInteractorFailure(result.error as never).issues[0]?.customCode;
}

beforeEach(() => vi.clearAllMocks());

describe("CancelHostedBookingInteractor", () => {
  it("cancels as the booked host, removes the event with the reason, fires the change and emails the visitor", async () => {
    const { cancel, reservations, writer, announcer, mailer, calendars, ranAs } = build();

    const result = await as(HOST, () => cancel.invoke({ id: BOOKING_ID, reason: "  Out sick\u0007 " }));

    expect(result).toEqual({
      ok: true,
      data: {
        id: BOOKING_ID,
        status: "cancelled",
        startsAt: STARTS_AT.toISOString(),
        endsAt: "2026-11-20T09:30:00.000Z",
      },
    });
    expect(calendars.findOwnEvent).toHaveBeenCalledWith(EVENT_ID);
    expect(reservations.cancelHosted).toHaveBeenCalledWith(BOOKING_ID, "host", "Out sick", NOW);
    expect(ranAs).toEqual([HOST.id]);
    expect(writer.cancel).toHaveBeenCalledWith(eventRow(), "Out sick");
    const cancelled = await reservations.cancelHosted.mock.results[0]?.value;
    expect(announcer.changed).toHaveBeenCalledWith(cancelled, "cancelled", "host", { reason: "Out sick" });
    expect(mailer.send.mock.calls).toEqual([
      [{ kind: "cancelled", booking: cancelled, by: "host", reason: "Out sick" }],
    ]);
    expect(reservations.reopenHosted).not.toHaveBeenCalled();
  });

  it("cancels without a reason", async () => {
    const { cancel, reservations, writer, mailer } = build();

    expect((await as(HOST, () => cancel.invoke({ id: BOOKING_ID, reason: "" }))).ok).toBe(true);
    expect(reservations.cancelHosted).toHaveBeenCalledWith(BOOKING_ID, "host", null, NOW);
    expect(writer.cancel).toHaveBeenCalledWith(eventRow(), undefined);
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ kind: "cancelled", by: "host", reason: null }));
  });

  it.each([
    ["the booked host", HOST],
    ["the owner of the booking page", PAGE_OWNER],
    ["an administrator", OWNER],
  ])("lets %s cancel, always acting as the booked host", async (_name, user) => {
    const { cancel, ranAs, mailer } = build();

    expect((await as(user, () => cancel.invoke({ id: BOOKING_ID, reason: "" }))).ok).toBe(true);
    expect(ranAs).toEqual([HOST.id]);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it("refuses another member of the workspace and touches nothing", async () => {
    const { cancel, reservations, writer, announcer, mailer } = build();

    const result = await as(COLLEAGUE, () => cancel.invoke({ id: BOOKING_ID, reason: "" }));

    expect(code(result)).toBe(CustomErrorCode.bookingUnavailable);
    expect(reservations.cancelHosted).not.toHaveBeenCalled();
    expect(writer.cancel).not.toHaveBeenCalled();
    expect(announcer.changed).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("refuses a member whose role may not change messaging", async () => {
    const { cancel, reservations } = build();

    await expect(as(READER, () => cancel.invoke({ id: BOOKING_ID, reason: "" }))).rejects.toThrow(ForbiddenError);
    expect(reservations.cancelHosted).not.toHaveBeenCalled();
  });

  it.each([
    ["the booking is not an open one", { booking: null }],
    ["the booking belongs to another workspace", { booking: bookingRow({ companyId: "other-company-id" }) }],
    ["the meeting already started", { booking: bookingRow({ startsAt: NOW }) }],
    ["the booking page is gone", { link: null }],
  ] as const)("answers not found when %s", async (_name, setup) => {
    const { cancel, reservations, mailer } = build(setup as Setup);

    expect(code(await as(OWNER, () => cancel.invoke({ id: BOOKING_ID, reason: "" })))).toBe(
      CustomErrorCode.bookingUnavailable,
    );
    expect(reservations.cancelHosted).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("cancels without the provider while the host's calendar account needs a reconnect, and still emails the visitor", async () => {
    const { cancel, calendars, reservations, writer, announcer, mailer } = build();
    calendars.findOwnEvent.mockResolvedValue(eventRow({ accountStatus: "credentials" }));

    const result = await as(HOST, () => cancel.invoke({ id: BOOKING_ID, reason: "Out sick" }));

    expect(result).toMatchObject({ ok: true, data: { id: BOOKING_ID, status: "cancelled" } });
    expect(reservations.cancelHosted).toHaveBeenCalledWith(BOOKING_ID, "host", "Out sick", NOW);
    expect(writer.cancel).not.toHaveBeenCalled();
    expect(reservations.reopenHosted).not.toHaveBeenCalled();
    const cancelled = await reservations.cancelHosted.mock.results[0]?.value;
    expect(announcer.changed).toHaveBeenCalledWith(cancelled, "cancelled", "host", { reason: "Out sick" });
    expect(mailer.send.mock.calls).toEqual([
      [{ kind: "cancelled", booking: cancelled, by: "host", reason: "Out sick" }],
    ]);
  });

  it("reopens the booking and sends nothing when the calendar refuses to remove the event", async () => {
    const { cancel, writer, reservations, announcer, mailer } = build();
    writer.cancel.mockResolvedValue({ ok: false, error: CustomErrorCode.unipileProviderRejected });

    expect(code(await as(HOST, () => cancel.invoke({ id: BOOKING_ID, reason: "" })))).toBe(
      CustomErrorCode.unipileProviderRejected,
    );
    expect(reservations.reopenHosted).toHaveBeenCalledWith(BOOKING_ID);
    expect(announcer.changed).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("stops at the plan gate", async () => {
    const { cancel, bookings } = build({ entitled: false });

    expect((await as(HOST, () => cancel.invoke({ id: BOOKING_ID, reason: "" }))).ok).toBe(false);
    expect(bookings.findConfirmed).not.toHaveBeenCalled();
  });
});

describe("RescheduleHostedBookingInteractor", () => {
  const INPUT = { id: BOOKING_ID, startsAt: NEW_START };

  it("moves the booking to a free time of its page as the booked host, updates the event, fires the change and emails the visitor", async () => {
    const { reschedule, reservations, availability, writer, announcer, mailer, records, ranAs } = build();

    const result = await as(HOST, () => reschedule.invoke(INPUT));

    expect(result).toEqual({
      ok: true,
      data: { id: BOOKING_ID, status: "rescheduled", startsAt: NEW_START, endsAt: NEW_END },
    });
    expect(reservations.moveHosted).toHaveBeenCalledWith(
      BOOKING_ID,
      { startsAt: new Date(NEW_START), endsAt: new Date(NEW_END) },
      NOW,
      expect.any(Function),
    );
    expect(ranAs).toEqual([HOST.id]);
    expect(availability.isOpen).toHaveBeenCalledWith(
      expect.objectContaining({ token: lookupLink().token }),
      NOW,
      new Date(NEW_START),
      { bookingId: BOOKING_ID, calendarEventId: EVENT_ID },
    );
    expect(writer.update).toHaveBeenCalledWith(OWNER.companyId, eventRow(), {
      startsAt: new Date(NEW_START),
      endsAt: new Date(NEW_END),
      timeZone: "Europe/Berlin",
      notifyAttendees: true,
    });
    expect(records.moveBookingRecord).not.toHaveBeenCalled();
    const moved = (await reservations.moveHosted.mock.results[0]?.value) as BookingMove;
    expect(moved.booking).toMatchObject({ startsAt: new Date(NEW_START), reminderSentAt: null });
    expect(announcer.changed).toHaveBeenCalledWith(moved.booking, "rescheduled", "host", {
      previousStartsAt: STARTS_AT,
    });
    expect(mailer.send.mock.calls).toEqual([
      [{ kind: "rescheduled", booking: moved.booking, by: "host", previousStartsAt: STARTS_AT }],
    ]);
  });

  it("moves the start field of the booking's record and still answers when that fails", async () => {
    const { reschedule, records, mailer } = build({
      booking: bookingRow({ hostUserId: HOST.id, recordTypeId: RECORD_TYPE, recordId: RECORD_ID }),
      link: lookupLink({ startFieldId: START_FIELD }),
    });
    records.moveBookingRecord.mockRejectedValue(new Error("boom"));

    expect((await as(HOST, () => reschedule.invoke(INPUT))).ok).toBe(true);
    expect(records.moveBookingRecord).toHaveBeenCalledWith({
      ref: { typeId: RECORD_TYPE, recordId: RECORD_ID },
      startFieldId: START_FIELD,
      startsAt: new Date(NEW_START),
      timeZone: "Europe/Berlin",
    });
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the owner of the booking page", PAGE_OWNER],
    ["an administrator", OWNER],
  ])("lets %s move it, acting as the booked host", async (_name, user) => {
    const { reschedule, ranAs } = build();

    expect((await as(user, () => reschedule.invoke(INPUT))).ok).toBe(true);
    expect(ranAs).toEqual([HOST.id]);
  });

  it("refuses another member of the workspace and touches nothing", async () => {
    const { reschedule, reservations, writer, announcer, mailer } = build();

    expect(code(await as(COLLEAGUE, () => reschedule.invoke(INPUT)))).toBe(CustomErrorCode.bookingUnavailable);
    expect(reservations.moveHosted).not.toHaveBeenCalled();
    expect(writer.update).not.toHaveBeenCalled();
    expect(announcer.changed).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("refuses a member whose role may not change messaging", async () => {
    await expect(as(READER, () => build().reschedule.invoke(INPUT))).rejects.toThrow(ForbiddenError);
  });

  it("refuses a time that is not free, and the time the booking already has", async () => {
    const taken = build();
    taken.availability.isOpen.mockResolvedValue(false);

    expect(code(await as(HOST, () => taken.reschedule.invoke(INPUT)))).toBe(CustomErrorCode.bookingSlotTaken);
    expect(taken.writer.update).not.toHaveBeenCalled();
    expect(taken.mailer.send).not.toHaveBeenCalled();

    const same = build();
    expect(
      code(await as(HOST, () => same.reschedule.invoke({ id: BOOKING_ID, startsAt: STARTS_AT.toISOString() }))),
    ).toBe(CustomErrorCode.bookingSlotTaken);
    expect(same.reservations.moveHosted).not.toHaveBeenCalled();
  });

  it("asks to reconnect the host's calendar before moving anything", async () => {
    const { reschedule, calendars, reservations } = build();
    calendars.findOwnEvent.mockResolvedValue(eventRow({ accountStatus: "credentials" }));

    expect(code(await as(HOST, () => reschedule.invoke(INPUT)))).toBe(CustomErrorCode.calendarNeedsReconnect);
    expect(reservations.moveHosted).not.toHaveBeenCalled();
  });

  it("puts the old time and reminder state back and sends nothing when the calendar refuses the change", async () => {
    const reminded = new Date("2026-11-15T09:00:00.000Z");
    const { reschedule, writer, reservations, announcer, mailer, records } = build({
      booking: bookingRow({ hostUserId: HOST.id, reminderSentAt: reminded }),
    });
    writer.update.mockResolvedValue({ ok: false, error: CustomErrorCode.unipileProviderRejected });

    expect(code(await as(HOST, () => reschedule.invoke(INPUT)))).toBe(CustomErrorCode.unipileProviderRejected);
    expect(reservations.restoreTimes).toHaveBeenCalledWith(BOOKING_ID, {
      startsAt: STARTS_AT,
      endsAt: new Date("2026-11-20T09:30:00.000Z"),
      rescheduledAt: null,
      reminderSentAt: reminded,
    });
    expect(records.moveBookingRecord).not.toHaveBeenCalled();
    expect(announcer.changed).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

describe("GetHostedBookingSlotsInteractor", () => {
  it("offers the free times of the booking's page for its host, without the time it already has", async () => {
    const { slots, availability } = build();

    const result = await as(PAGE_OWNER, () => slots.invoke({ id: BOOKING_ID, days: 31 }));

    expect(result).toEqual({
      ok: true,
      data: {
        timeZone: "Europe/Berlin",
        slots: [{ startsAt: NEW_START, endsAt: NEW_END }],
        nextFrom: "2026-11-30T00:00:00.000Z",
      },
    });
    expect(availability.slots).toHaveBeenCalledWith(
      expect.objectContaining({ token: lookupLink().token }),
      [HOST.id],
      NOW,
      undefined,
      31,
      { bookingId: BOOKING_ID, calendarEventId: EVENT_ID },
    );
  });

  it("refuses another member of the workspace", async () => {
    const { slots, availability } = build();

    expect(code(await as(COLLEAGUE, () => slots.invoke({ id: BOOKING_ID, days: 14 })))).toBe(
      CustomErrorCode.bookingUnavailable,
    );
    expect(availability.slots).not.toHaveBeenCalled();
  });
});
