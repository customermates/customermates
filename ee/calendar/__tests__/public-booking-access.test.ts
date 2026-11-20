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

import type { OpenBooking, OpenBookingLink } from "../public-booking-access";

import { PUBLIC_BOOKING_UNAVAILABLE } from "../public-booking-access";
import {
  ANA,
  BO,
  bookingRow,
  buildAccess,
  calendarId,
  calendarRow,
  candidate,
  currentUserId,
  lookupLink,
  MANAGE_TOKEN,
  OWNER,
  STRANGER,
  TOKEN,
} from "./public-booking-fixtures";

const TEAM = lookupLink({
  assignment: "roundRobin",
  hostCandidates: [candidate(OWNER), candidate(ANA), candidate(BO)],
});

async function opened(access: ReturnType<typeof buildAccess>["access"]) {
  const seen: { link?: OpenBookingLink; user?: string } = {};
  const result = await access.open(TOKEN, "visitor", (link) => {
    seen.link = link;
    seen.user = currentUserId();
    return Promise.resolve("read" as const);
  });
  return { result, ...seen };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.APP_MODE = "cloud";
});

describe("PublicBookingAccess.open", () => {
  it("hands over every host whose calendar can be used, checked as that host, and reads as the owner", async () => {
    const { access, findOwnCalendar } = buildAccess({ link: TEAM });

    const { result, link, user } = await opened(access);

    expect(result).toBe("read");
    expect(user).toBe(OWNER.id);
    expect(link?.usableHosts).toEqual([
      { userId: OWNER.id, name: "Test User", calendar: calendarRow(OWNER.id) },
      { userId: ANA.id, name: "Ana Host", calendar: calendarRow(ANA.id) },
      { userId: BO.id, name: "Bo Host", calendar: calendarRow(BO.id) },
    ]);
    expect(findOwnCalendar).toHaveBeenCalledTimes(3);
  });

  it("drops a host without the permission, without the plan or without a usable calendar", async () => {
    const { access } = buildAccess({
      link: TEAM,
      permitted: (userId) => userId !== ANA.id,
      calendars: {
        [calendarId(OWNER.id)]: calendarRow(OWNER.id, { accountStatus: "permissions" }),
        [calendarId(ANA.id)]: calendarRow(ANA.id),
        [calendarId(BO.id)]: calendarRow(BO.id),
      },
    });
    const unplanned = buildAccess({ link: TEAM, entitled: (userId) => userId !== ANA.id });

    expect((await opened(access)).link?.usableHosts.map((host) => host.userId)).toEqual([BO.id]);
    expect((await opened(unplanned.access)).link?.usableHosts.map((host) => host.userId)).toEqual([OWNER.id, BO.id]);
  });

  it("drops a host whose calendar was taken from another member", async () => {
    const { access } = buildAccess({
      link: lookupLink({
        assignment: "roundRobin",
        hostCandidates: [candidate(OWNER), { ...candidate(ANA), calendarId: calendarId(OWNER.id) }],
      }),
    });

    expect((await opened(access)).link?.usableHosts.map((host) => host.userId)).toEqual([OWNER.id]);
  });

  it("drops a host of another company and a host who is no longer an active member", async () => {
    const { access } = buildAccess({
      link: lookupLink({
        assignment: "roundRobin",
        hostCandidates: [
          candidate(OWNER),
          candidate(STRANGER),
          { userId: "host-gone", name: "Gone", calendarId: calendarId("host-gone") },
        ],
      }),
    });

    expect((await opened(access)).link?.usableHosts.map((host) => host.userId)).toEqual([OWNER.id]);
  });

  it("is unavailable when no host is left, even though the owner may read", async () => {
    const { access } = buildAccess({
      link: TEAM,
      calendars: {
        [calendarId(OWNER.id)]: null,
        [calendarId(ANA.id)]: calendarRow(ANA.id, { accountStatus: "credentials" }),
        [calendarId(BO.id)]: null,
      },
    });
    const empty = buildAccess({ link: lookupLink({ calendarId: null, hostCandidates: [] }) });

    expect((await opened(access)).result).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect((await opened(empty.access)).result).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
  });

  it("is unavailable when the owner lost the permission, even when other hosts can still take bookings", async () => {
    const { access } = buildAccess({ link: TEAM, permitted: (userId) => userId !== OWNER.id });

    const { result, link } = await opened(access);

    expect(result).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(link).toBeUndefined();
  });

  it("is unavailable for a paused page, a company being deleted and outside the cloud", async () => {
    expect((await opened(buildAccess({ link: lookupLink({ enabled: false }) }).access)).result).toEqual(
      PUBLIC_BOOKING_UNAVAILABLE,
    );
    expect((await opened(buildAccess({ link: lookupLink({ companyDeleting: true }) }).access)).result).toEqual(
      PUBLIC_BOOKING_UNAVAILABLE,
    );
    expect((await opened(buildAccess({ link: null }).access)).result).toEqual(PUBLIC_BOOKING_UNAVAILABLE);

    mockEnv.APP_MODE = "self-hosted";
    const { access, lookup } = buildAccess();
    expect((await opened(access)).result).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(lookup.findByTokenUnscoped).not.toHaveBeenCalled();
  });
});

describe("PublicBookingAccess.openBooking", () => {
  async function openBooking(access: ReturnType<typeof buildAccess>["access"]) {
    const seen: { opened?: OpenBooking; user?: string } = {};
    const result = await access.openBooking(MANAGE_TOKEN, "visitor", (booking) => {
      seen.opened = booking;
      seen.user = currentUserId();
      return Promise.resolve("read" as const);
    });
    return { result, ...seen };
  }

  it("runs as the booked host and hands over the booking, its page and the host's calendar", async () => {
    const booking = bookingRow({ hostUserId: ANA.id, hostName: "Ana Host" });
    const { access, lookup } = buildAccess({ link: TEAM, booking });

    const { result, opened: found, user } = await openBooking(access);

    expect(result).toBe("read");
    expect(user).toBe(ANA.id);
    expect(lookup.findByManageTokenUnscoped).toHaveBeenCalledWith(MANAGE_TOKEN);
    expect(lookup.findByTokenUnscoped).toHaveBeenCalledWith(booking.linkToken);
    expect(found).toEqual({
      booking,
      link: TEAM,
      host: { userId: ANA.id, name: "Ana Host", calendar: calendarRow(ANA.id) },
    });
  });

  it("refuses an unknown token and a booking that is only reserved", async () => {
    expect((await openBooking(buildAccess({ booking: null }).access)).result).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    const reserved = buildAccess({ booking: bookingRow({ status: "reserved" }) });
    expect((await openBooking(reserved.access)).result).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(reserved.lookup.findByTokenUnscoped).not.toHaveBeenCalled();
  });

  it("refuses a booking whose page or company is gone, or whose host lost the permission", async () => {
    expect((await openBooking(buildAccess({ link: null }).access)).result).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect((await openBooking(buildAccess({ link: lookupLink({ companyDeleting: true }) }).access)).result).toEqual(
      PUBLIC_BOOKING_UNAVAILABLE,
    );
    expect((await openBooking(buildAccess({ permitted: () => false }).access)).result).toEqual(
      PUBLIC_BOOKING_UNAVAILABLE,
    );
    expect(
      (await openBooking(buildAccess({ booking: bookingRow({ hostUserId: "host-gone" }) }).access)).result,
    ).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
  });

  it("still opens a cancelled booking and one of a paused page, and names no host when the host is off the page or the calendar is unusable", async () => {
    const paused = buildAccess({ link: lookupLink({ enabled: false }), booking: bookingRow({ status: "cancelled" }) });
    const removed = buildAccess({ link: lookupLink(), booking: bookingRow({ hostUserId: ANA.id }) });
    const broken = buildAccess({
      calendars: { [calendarId(OWNER.id)]: calendarRow(OWNER.id, { accountStatus: "credentials" }) },
    });

    expect(await openBooking(paused.access)).toMatchObject({ result: "read", opened: { host: { userId: OWNER.id } } });
    expect(await openBooking(removed.access)).toMatchObject({ result: "read", user: ANA.id, opened: { host: null } });
    expect(await openBooking(broken.access)).toMatchObject({ result: "read", opened: { host: null } });
  });

  it("is unavailable outside the cloud and looks nothing up", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const { access, lookup } = buildAccess();

    expect((await openBooking(access)).result).toEqual(PUBLIC_BOOKING_UNAVAILABLE);
    expect(lookup.findByManageTokenUnscoped).not.toHaveBeenCalled();
  });

  it("limits one visitor", async () => {
    const { access } = buildAccess({ perVisitor: 1 });

    await openBooking(access);

    expect((await openBooking(access)).result).toEqual({
      status: "rateLimited",
      retryAfterSeconds: expect.any(Number),
    });
  });
});

describe("PublicBookingAccess helpers", () => {
  it("runs work as a host and answers null for someone who is not an active member", async () => {
    const { access } = buildAccess();

    expect(await access.asHost(BO.id, () => Promise.resolve(currentUserId()))).toBe(BO.id);
    expect(await access.asHost("host-gone", () => Promise.resolve("ran"))).toBeNull();
  });

  it("names the member locale it was given", () => {
    expect(buildAccess({ locale: "de" }).access.memberLocale()).toBe("de");
  });
});
