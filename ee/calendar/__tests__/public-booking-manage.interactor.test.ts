import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_PRISMA_DB_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "test",
  APP_MODE: "cloud" as string,
  BASE_URL: "http://localhost:4000",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  BETTER_AUTH_SECRET: "0".repeat(32),
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import type { AppLocale } from "@/i18n/locale-registry";

import { CustomErrorCode } from "@/core/validation/validation.types";

import type { BookingLinkLookup } from "../booking-link.repo";
import type { BookingMove, BookingRow } from "../booking-reservation.repo";

import { CancelPublicBookingInteractor } from "../cancel-public-booking.interactor";
import { PUBLIC_BOOKING_UNAVAILABLE } from "../public-booking-access";
import { ReadPublicBookingManageInteractor } from "../read-public-booking-manage.interactor";
import { ReadPublicBookingManageSlotsInteractor } from "../read-public-booking-manage-slots.interactor";
import { ReschedulePublicBookingInteractor } from "../reschedule-public-booking.interactor";
import {
  type AccessOptions,
  ANA,
  BOOKING_ID,
  bookingRow,
  buildAccess,
  calendarId,
  calendarRow,
  candidate,
  currentUserId,
  EVENT_ID,
  eventRow,
  lookupLink,
  MANAGE_TOKEN,
  OWNER,
} from "./public-booking-fixtures";

const NOW = new Date("2026-11-16T10:00:00.000Z");
const STARTS_AT = new Date("2026-11-20T09:00:00.000Z");
const NEW_START = "2026-11-21T10:00:00.000Z";
const RECORD_TYPE = "10000000-0000-4000-8000-000000000002";
const RECORD_ID = "40000000-0000-4000-8000-000000000002";
const START_FIELD = "20000000-0000-4000-8000-000000000002";

type Setup = {
  link?: BookingLinkLookup | null;
  booking?: BookingRow | null;
  calendars?: AccessOptions["calendars"];
  locale?: AppLocale;
};

function access(setup: Setup = {}) {
  return buildAccess({
    link: setup.link,
    booking: setup.booking,
    calendars: setup.calendars,
    now: NOW,
    locale: setup.locale,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.APP_MODE = "cloud";
});

describe("ReadPublicBookingManageInteractor", () => {
  const read = (setup: Setup = {}) => new ReadPublicBookingManageInteractor(access(setup).access);

  it("shows an upcoming booking that the visitor may cancel and move", async () => {
    expect(await read().invoke({ manageToken: MANAGE_TOKEN, visitor: "v" })).toEqual({
      status: "found",
      booking: {
        title: "Intro call",
        hostName: "Test User",
        workspaceName: "Acme",
        inviteeName: "Ada Lovelace",
        startsAt: STARTS_AT.toISOString(),
        endsAt: "2026-11-20T09:30:00.000Z",
        durationMinutes: 30,
        horizonDays: 30,
        state: "upcoming",
        canCancel: true,
        canReschedule: true,
        bookAgainToken: lookupLink().token,
      },
    });
  });

  it.each([
    ["visitors may not change bookings", { link: lookupLink({ inviteeChanges: false }) }, "upcoming", false, false],
    ["the booking was cancelled", { booking: bookingRow({ status: "cancelled" }) }, "cancelled", false, false],
    ["the booking already started", { booking: bookingRow({ startsAt: NOW }) }, "past", false, false],
    ["the page is paused", { link: lookupLink({ enabled: false }) }, "upcoming", true, false],
    [
      "the host's calendar cannot be used",
      { calendars: { [calendarId(OWNER.id)]: calendarRow(OWNER.id, { accountStatus: "credentials" }) } },
      "upcoming",
      true,
      false,
    ],
  ] as const)(
    "when %s it shows the state and what the visitor may still do",
    async (_name, setup, state, canCancel, canReschedule) => {
      const result = await read(setup as Setup).invoke({ manageToken: MANAGE_TOKEN });

      expect(result).toMatchObject({ status: "found", booking: { state, canCancel, canReschedule } });
    },
  );

  it("offers booking again only while the page is live", async () => {
    expect(await read({ link: lookupLink({ enabled: false }) }).invoke({ manageToken: MANAGE_TOKEN })).toMatchObject({
      booking: { bookAgainToken: null },
    });
  });

  it("names the booked host of a round robin page", async () => {
    const result = await read({
      link: lookupLink({ assignment: "roundRobin", hostCandidates: [candidate(OWNER), candidate(ANA)] }),
      booking: bookingRow({ hostUserId: ANA.id, hostName: "Ana Host" }),
    }).invoke({ manageToken: MANAGE_TOKEN });

    expect(result).toMatchObject({ status: "found", booking: { hostName: "Ana Host", canReschedule: true } });
  });

  it("is unavailable for a malformed or unknown token and a reserved booking", async () => {
    expect(await read().invoke({ manageToken: "short" })).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(await read({ booking: null }).invoke({ manageToken: MANAGE_TOKEN })).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(await read({ booking: bookingRow({ status: "reserved" }) }).invoke({ manageToken: MANAGE_TOKEN })).toEqual(
      PUBLIC_BOOKING_UNAVAILABLE,
    );
  });
});

describe("ReadPublicBookingManageSlotsInteractor", () => {
  function slots(setup: Setup = {}) {
    const availability = {
      slots: vi.fn().mockResolvedValue({
        slots: [
          { startsAt: STARTS_AT.toISOString(), endsAt: "2026-11-20T09:30:00.000Z" },
          { startsAt: NEW_START, endsAt: "2026-11-21T10:30:00.000Z" },
        ],
        nextFrom: "2026-11-30T00:00:00.000Z",
      }),
    };
    return {
      availability,
      interactor: new ReadPublicBookingManageSlotsInteractor(access(setup).access, availability as never),
    };
  }

  it("offers the booked host's free times without the booking's own time and counts the booking itself as free", async () => {
    const { interactor, availability } = slots({
      booking: bookingRow({ hostUserId: ANA.id }),
      link: lookupLink({ assignment: "roundRobin", hostCandidates: [candidate(OWNER), candidate(ANA)] }),
    });

    const result = await interactor.invoke({ manageToken: MANAGE_TOKEN, from: "2026-11-17T00:00:00.000Z", days: 7 });

    expect(result).toEqual({
      status: "available",
      timeZone: "Europe/Berlin",
      slots: [{ startsAt: NEW_START, endsAt: "2026-11-21T10:30:00.000Z" }],
      nextFrom: "2026-11-30T00:00:00.000Z",
    });
    expect(availability.slots).toHaveBeenCalledWith(
      expect.objectContaining({ token: lookupLink().token }),
      [ANA.id],
      NOW,
      new Date("2026-11-17T00:00:00.000Z"),
      7,
      { bookingId: BOOKING_ID, calendarEventId: EVENT_ID },
    );
  });

  it.each([
    ["visitors may not change bookings", { link: lookupLink({ inviteeChanges: false }) }],
    ["the page is paused", { link: lookupLink({ enabled: false }) }],
    ["the booking was cancelled", { booking: bookingRow({ status: "cancelled" }) }],
    ["the booking already started", { booking: bookingRow({ startsAt: new Date(NOW.getTime() - 1) }) }],
  ] as const)("offers nothing when %s", async (_name, setup) => {
    const { interactor, availability } = slots(setup as Setup);

    expect(await interactor.invoke({ manageToken: MANAGE_TOKEN })).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(availability.slots).not.toHaveBeenCalled();
  });
});

function moveOf(booking: BookingRow, startsAt: Date): BookingMove {
  return {
    booking: { ...booking, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000) },
    previousStartsAt: booking.startsAt,
  };
}

function changeTools(booking: BookingRow) {
  const reservations = {
    cancelHosted: vi.fn(
      (_id: string, _by: string, _reason: string | null): Promise<BookingRow | null> =>
        Promise.resolve({ ...booking, status: "cancelled" }),
    ),
    reopenHosted: vi.fn().mockResolvedValue(undefined),
    moveHosted: vi.fn(
      (_id: string, to: { startsAt: Date }, _now: Date, isOpen: () => Promise<boolean>): Promise<BookingMove | null> =>
        isOpen().then((free) => (free ? moveOf(booking, to.startsAt) : null)),
    ),
    restoreTimes: vi.fn().mockResolvedValue(undefined),
  };
  const calendars = { findOwnEvent: vi.fn().mockResolvedValue(eventRow()) };
  const announcer = { changed: vi.fn().mockResolvedValue(undefined), notifyHost: vi.fn().mockResolvedValue(undefined) };
  return { reservations, calendars, announcer };
}

describe("CancelPublicBookingInteractor", () => {
  function cancel(setup: Setup = {}) {
    const booking = setup.booking ?? bookingRow();
    const built = access({ ...setup, booking });
    const tools = changeTools(booking);
    const hostOfCancel: string[] = [];
    tools.reservations.cancelHosted.mockImplementation(() => {
      hostOfCancel.push(currentUserId());
      return Promise.resolve({ ...booking, status: "cancelled" as const });
    });
    const writer = { cancel: vi.fn().mockResolvedValue({ ok: true }) };
    const interactor = new CancelPublicBookingInteractor(
      built.access,
      tools.reservations,
      tools.calendars,
      writer as never,
      tools.announcer,
    );
    return { interactor, writer, hostOfCancel, ...tools };
  }

  it("cancels as the booked host, removes the event with the reason, then announces and tells the host", async () => {
    const { interactor, reservations, writer, announcer, calendars, hostOfCancel } = cancel({ locale: "de" });

    expect(
      await interactor.invoke({ manageToken: MANAGE_TOKEN, visitor: "v", reason: "  Something came up\u0007 " }),
    ).toEqual({ status: "cancelled" });

    expect(calendars.findOwnEvent).toHaveBeenCalledWith(EVENT_ID);
    expect(reservations.cancelHosted).toHaveBeenCalledWith(BOOKING_ID, "invitee", "Something came up", NOW);
    expect(hostOfCancel).toEqual([OWNER.id]);
    expect(writer.cancel).toHaveBeenCalledWith(eventRow(), "Something came up");
    const cancelled = await reservations.cancelHosted.mock.results[0]?.value;
    expect(announcer.changed).toHaveBeenCalledWith(cancelled, "cancelled", "invitee", { reason: "Something came up" });
    expect(announcer.notifyHost).toHaveBeenCalledWith(cancelled, "cancelled", "de", "Something came up");
    expect(reservations.reopenHosted).not.toHaveBeenCalled();
  });

  it("cancels without a reason", async () => {
    const { interactor, reservations, writer, announcer } = cancel();

    expect(await interactor.invoke({ manageToken: MANAGE_TOKEN })).toEqual({ status: "cancelled" });

    expect(reservations.cancelHosted).toHaveBeenCalledWith(BOOKING_ID, "invitee", null, NOW);
    expect(writer.cancel).toHaveBeenCalledWith(eventRow(), undefined);
    expect(announcer.changed).toHaveBeenCalledWith(expect.anything(), "cancelled", "invitee", { reason: null });
  });

  it("still lets the visitor cancel while the page is paused", async () => {
    const { interactor, reservations } = cancel({ link: lookupLink({ enabled: false }) });

    expect(await interactor.invoke({ manageToken: MANAGE_TOKEN })).toEqual({ status: "cancelled" });
    expect(reservations.cancelHosted).toHaveBeenCalled();
  });

  it.each([
    ["visitors may not change bookings", { link: lookupLink({ inviteeChanges: false }) }],
    ["the booking was cancelled", { booking: bookingRow({ status: "cancelled" }) }],
    ["the booking already started", { booking: bookingRow({ startsAt: NOW }) }],
  ] as const)("refuses when %s and touches nothing", async (_name, setup) => {
    const { interactor, reservations, writer, announcer } = cancel(setup as Setup);

    expect(await interactor.invoke({ manageToken: MANAGE_TOKEN })).toEqual({ status: "notAllowed" });
    expect(reservations.cancelHosted).not.toHaveBeenCalled();
    expect(writer.cancel).not.toHaveBeenCalled();
    expect(announcer.changed).not.toHaveBeenCalled();
    expect(announcer.notifyHost).not.toHaveBeenCalled();
  });

  it("answers notAllowed when the booking changed in the meantime", async () => {
    const { interactor, reservations, writer, announcer } = cancel();
    reservations.cancelHosted.mockResolvedValue(null);

    expect(await interactor.invoke({ manageToken: MANAGE_TOKEN })).toEqual({ status: "notAllowed" });
    expect(writer.cancel).not.toHaveBeenCalled();
    expect(announcer.changed).not.toHaveBeenCalled();
  });

  it("reopens the booking and announces nothing when the provider refuses to remove the event", async () => {
    const { interactor, reservations, writer, announcer } = cancel();
    writer.cancel.mockResolvedValue({ ok: false, error: CustomErrorCode.unipileProviderRejected });

    expect(await interactor.invoke({ manageToken: MANAGE_TOKEN })).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(reservations.reopenHosted).toHaveBeenCalledWith(BOOKING_ID);
    expect(announcer.changed).not.toHaveBeenCalled();
    expect(announcer.notifyHost).not.toHaveBeenCalled();
  });

  it("is unavailable while the host's calendar account needs a reconnect and cancels nothing", async () => {
    const { interactor, reservations, calendars } = cancel();
    calendars.findOwnEvent.mockResolvedValue(eventRow({ accountStatus: "credentials" }));

    expect(await interactor.invoke({ manageToken: MANAGE_TOKEN })).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(reservations.cancelHosted).not.toHaveBeenCalled();
  });

  it("cancels a booking whose event is gone without asking the provider", async () => {
    const { interactor, writer, calendars, announcer } = cancel();
    calendars.findOwnEvent.mockResolvedValue(null);

    expect(await interactor.invoke({ manageToken: MANAGE_TOKEN })).toEqual({ status: "cancelled" });
    expect(writer.cancel).not.toHaveBeenCalled();
    expect(announcer.changed).toHaveBeenCalled();
  });

  it("is unavailable for a malformed input", async () => {
    const { interactor, reservations } = cancel();

    expect(await interactor.invoke({ manageToken: MANAGE_TOKEN, reason: "x".repeat(5_000) })).toEqual(
      PUBLIC_BOOKING_UNAVAILABLE,
    );
    expect(await interactor.invoke({ manageToken: MANAGE_TOKEN, extra: true })).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(reservations.cancelHosted).not.toHaveBeenCalled();
  });
});

describe("ReschedulePublicBookingInteractor", () => {
  function reschedule(setup: Setup = {}) {
    const booking = setup.booking ?? bookingRow();
    const built = access({ ...setup, booking });
    const tools = changeTools(booking);
    const availability = { isOpen: vi.fn().mockResolvedValue(true) };
    const writer = { update: vi.fn().mockResolvedValue({ ok: true }) };
    const records = { moveBookingRecord: vi.fn().mockResolvedValue(true) };
    const interactor = new ReschedulePublicBookingInteractor(
      built.access,
      availability,
      tools.reservations,
      tools.calendars,
      writer as never,
      records,
      tools.announcer,
    );
    return { interactor, availability, writer, records, booking, ...tools };
  }

  const INPUT = { manageToken: MANAGE_TOKEN, visitor: "v", startsAt: NEW_START, timeZone: "Europe/London" };

  it("moves the booking when the new time is open for the host, updates the event and announces the change", async () => {
    const { interactor, availability, reservations, writer, announcer, records, booking } = reschedule({
      locale: "de",
    });

    expect(await interactor.invoke(INPUT)).toEqual({
      status: "rescheduled",
      startsAt: NEW_START,
      endsAt: "2026-11-21T10:30:00.000Z",
    });

    expect(reservations.moveHosted).toHaveBeenCalledWith(
      BOOKING_ID,
      { startsAt: new Date(NEW_START), endsAt: new Date("2026-11-21T10:30:00.000Z") },
      NOW,
      expect.any(Function),
    );
    expect(availability.isOpen).toHaveBeenCalledWith(
      expect.objectContaining({ token: lookupLink().token }),
      NOW,
      new Date(NEW_START),
      { bookingId: BOOKING_ID, calendarEventId: EVENT_ID },
    );
    expect(writer.update).toHaveBeenCalledWith(OWNER.companyId, eventRow(), {
      startsAt: new Date(NEW_START),
      endsAt: new Date("2026-11-21T10:30:00.000Z"),
      timeZone: "Europe/Berlin",
      notifyAttendees: true,
    });
    expect(records.moveBookingRecord).not.toHaveBeenCalled();
    const moved = moveOf(booking, new Date(NEW_START));
    expect(announcer.changed).toHaveBeenCalledWith(moved.booking, "rescheduled", "invitee", {
      previousStartsAt: STARTS_AT,
    });
    expect(announcer.notifyHost).toHaveBeenCalledWith(moved.booking, "rescheduled", "de");
    expect(reservations.restoreTimes).not.toHaveBeenCalled();
  });

  it("moves the start field of the booking record and still answers when that fails", async () => {
    const booking = bookingRow({ recordTypeId: RECORD_TYPE, recordId: RECORD_ID });
    const { interactor, records } = reschedule({ booking, link: lookupLink({ startFieldId: START_FIELD }) });
    records.moveBookingRecord.mockRejectedValue(new Error("boom"));

    expect((await interactor.invoke(INPUT)).status).toBe("rescheduled");
    expect(records.moveBookingRecord).toHaveBeenCalledWith({
      ref: { typeId: RECORD_TYPE, recordId: RECORD_ID },
      startFieldId: START_FIELD,
      startsAt: new Date(NEW_START),
      timeZone: "Europe/Berlin",
    });
  });

  it("answers slotTaken when the time is no longer open and changes nothing", async () => {
    const { interactor, availability, writer, announcer } = reschedule();
    availability.isOpen.mockResolvedValue(false);

    expect(await interactor.invoke(INPUT)).toEqual({ status: "slotTaken" });
    expect(writer.update).not.toHaveBeenCalled();
    expect(announcer.changed).not.toHaveBeenCalled();
  });

  it("answers slotTaken for the time the booking already has", async () => {
    const { interactor, reservations } = reschedule();

    expect(await interactor.invoke({ ...INPUT, startsAt: STARTS_AT.toISOString() })).toEqual({ status: "slotTaken" });
    expect(reservations.moveHosted).not.toHaveBeenCalled();
  });

  it("restores the old times and announces nothing when the provider refuses the change", async () => {
    const { interactor, writer, reservations, announcer, records } = reschedule({
      booking: bookingRow({ recordTypeId: RECORD_TYPE, recordId: RECORD_ID }),
    });
    writer.update.mockResolvedValue({ ok: false, error: CustomErrorCode.unipileProviderRejected });

    expect(await interactor.invoke(INPUT)).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(reservations.restoreTimes).toHaveBeenCalledWith(BOOKING_ID, {
      startsAt: STARTS_AT,
      endsAt: new Date("2026-11-20T09:30:00.000Z"),
    });
    expect(records.moveBookingRecord).not.toHaveBeenCalled();
    expect(announcer.changed).not.toHaveBeenCalled();
    expect(announcer.notifyHost).not.toHaveBeenCalled();
  });

  it.each([
    ["visitors may not change bookings", { link: lookupLink({ inviteeChanges: false }) }],
    ["the page is paused", { link: lookupLink({ enabled: false }) }],
    ["the booking was cancelled", { booking: bookingRow({ status: "cancelled" }) }],
    ["the booking already started", { booking: bookingRow({ startsAt: NOW }) }],
    [
      "the host's calendar cannot be used",
      { calendars: { [calendarId(OWNER.id)]: calendarRow(OWNER.id, { accountStatus: "credentials" }) } },
    ],
  ] as const)("refuses when %s", async (_name, setup) => {
    const { interactor, reservations, writer } = reschedule(setup as Setup);

    expect(await interactor.invoke(INPUT)).toEqual({ status: "notAllowed" });
    expect(reservations.moveHosted).not.toHaveBeenCalled();
    expect(writer.update).not.toHaveBeenCalled();
  });

  it("is unavailable when the event is gone or its account needs a reconnect", async () => {
    const gone = reschedule();
    gone.calendars.findOwnEvent.mockResolvedValue(null);
    const stale = reschedule();
    stale.calendars.findOwnEvent.mockResolvedValue(eventRow({ accountStatus: "permissions" }));
    const unlinked = reschedule({ booking: bookingRow({ calendarEventId: null }) });

    for (const { interactor, reservations } of [gone, stale, unlinked]) {
      expect(await interactor.invoke(INPUT)).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
      expect(reservations.moveHosted).not.toHaveBeenCalled();
    }
  });

  it("is unavailable for a malformed input", async () => {
    const { interactor } = reschedule();

    expect(await interactor.invoke({ ...INPUT, startsAt: "tomorrow" })).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(await interactor.invoke({ ...INPUT, timeZone: "Mars/Base" })).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
  });
});
