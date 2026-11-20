import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { PrismaBookingRepo } = await import("../prisma-booking.repository");
const { PrismaCalendarWriteAccessRepo } = await import("../prisma-calendar-write-access.repository");
const { DEFAULT_WORKING_HOURS } = await import("../working-hours");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;
type Repo = InstanceType<typeof PrismaBookingRepo>;
type Member = Workspace["admin"];

async function workspace(): Promise<Workspace> {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

async function connectCalendar(
  w: Workspace,
  owner: { id: string },
  status: "ok" | "permissions" = "ok",
  name = "Work",
) {
  return runWithoutTenant(async () => {
    const account = await prisma.connectedAccount.create({
      data: {
        companyId: w.companyId,
        userId: owner.id,
        provider: "google",
        status,
        hasCalendar: true,
        hasMessaging: true,
        unipileAccountId: randomUUID(),
        emailAddress: "host@example.test",
      },
    });
    const calendar = await prisma.calendar.create({
      data: { companyId: w.companyId, connectedAccountId: account.id, unipileCalendarId: randomUUID(), name },
    });
    return { account, calendar };
  });
}

const DAY_MS = 86_400_000;
const future = (days: number, hour = 9) => {
  const at = new Date(Date.now() + days * DAY_MS);
  at.setUTCHours(hour, 0, 0, 0);
  return at;
};

function linkData(calendarId: string, assignment: "single" | "roundRobin" = "roundRobin") {
  return {
    calendarId,
    title: "Team call",
    description: null,
    durationMinutes: 30,
    bufferMinutes: 0,
    minNoticeMinutes: 240,
    horizonDays: 30,
    timeZone: "Europe/Berlin",
    workingHours: DEFAULT_WORKING_HOURS,
    withVideo: false,
    personTypeId: null,
    personRelationshipId: null,
    recordTypeId: null,
    startFieldId: null,
    questions: [],
    successMessage: null,
    enabled: true,
    assignment,
    inviteeChanges: true,
  };
}

function reservation(
  bookingLinkId: string,
  startsAt: Date,
  email = "ada@example.test",
  manageToken: string = randomUUID(),
) {
  return {
    bookingLinkId,
    manageToken: `manage-${manageToken}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 60_000),
    inviteeName: "Ada",
    inviteeEmail: email,
    timeZone: "Europe/London",
    answers: { question: "Pricing" },
    ipHash: null,
  };
}

const open = () => Promise.resolve(true);

async function confirmed(w: Workspace, repo: Repo, host: Member, linkId: string, startsAt: Date, email?: string) {
  const reserved = await w.as(host, () => repo.reserve(reservation(linkId, startsAt, email), open));
  if (!reserved) throw new Error("not reserved");
  await w.as(host, () =>
    repo.confirm(reserved.id, {
      calendarEventId: randomUUID(),
      personTypeId: null,
      personRecordId: null,
      recordTypeId: null,
      recordId: null,
    }),
  );
  return reserved.id;
}

const stored = (id: string) => runWithoutTenant(() => prisma.booking.findUniqueOrThrow({ where: { id } }));

async function teamPage(w: Workspace, repo: Repo, assignment: "single" | "roundRobin" = "roundRobin") {
  const own = await connectCalendar(w, w.admin);
  const theirs = await connectCalendar(w, w.member);
  const token = `token-team-${randomUUID().slice(0, 12)}`;
  const link = await w.as(w.admin, () =>
    repo.create(token, linkData(own.calendar.id, assignment), [
      { userId: w.member.id, calendarId: theirs.calendar.id },
    ]),
  );
  return { link, token, own, theirs };
}

describeDatabase("round robin hosts of a booking page", { timeout: 60_000 }, () => {
  it("stores the further hosts in order, replaces them and keeps them when an update does not name them", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link, token, theirs } = await teamPage(w, repo);

    expect(link.hosts).toEqual([
      { userId: w.member.id, name: expect.stringContaining("Member"), calendarName: "Work" },
    ]);
    expect(await runWithoutTenant(() => repo.findByTokenUnscoped(token))).toMatchObject({
      assignment: "roundRobin",
      hostCandidates: [
        expect.objectContaining({ userId: w.admin.id }),
        { userId: w.member.id, name: expect.stringContaining("Member"), calendarId: theirs.calendar.id },
      ],
    });

    const renamed = await w.as(w.admin, () => repo.update(link.id, { title: "Renamed" }));
    expect(renamed?.hosts.map((host) => host.userId)).toEqual([w.member.id]);

    const cleared = await w.as(w.admin, () => repo.update(link.id, {}, []));
    expect(cleared?.hosts).toEqual([]);
    expect(await runWithoutTenant(() => prisma.bookingLinkHost.count({ where: { bookingLinkId: link.id } }))).toBe(0);
    expect((await runWithoutTenant(() => repo.findByTokenUnscoped(token)))?.hostCandidates).toEqual([
      expect.objectContaining({ userId: w.admin.id }),
    ]);
  });

  it("offers further hosts only on a round robin page and skips a host whose calendar is gone or who is the owner", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link, token, own, theirs } = await teamPage(w, repo, "single");

    expect((await runWithoutTenant(() => repo.findByTokenUnscoped(token)))?.hostCandidates).toEqual([
      expect.objectContaining({ userId: w.admin.id }),
    ]);

    await w.as(w.admin, () =>
      repo.update(link.id, { assignment: "roundRobin" }, [
        { userId: w.admin.id, calendarId: own.calendar.id },
        { userId: w.member.id, calendarId: theirs.calendar.id },
      ]),
    );
    expect(
      (await runWithoutTenant(() => repo.findByTokenUnscoped(token)))?.hostCandidates.map((host) => host.userId),
    ).toEqual([w.admin.id, w.member.id]);

    await runWithoutTenant(() => prisma.calendar.delete({ where: { id: theirs.calendar.id } }));
    expect(
      (await runWithoutTenant(() => repo.findByTokenUnscoped(token)))?.hostCandidates.map((host) => host.userId),
    ).toEqual([w.admin.id]);
    expect((await w.as(w.admin, () => repo.find(link.id)))?.hosts).toEqual([
      expect.objectContaining({ userId: w.member.id, calendarName: null }),
    ]);
  });

  it("does not let another member change the hosts of a page they do not own", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link } = await teamPage(w, repo);

    expect(await w.as(w.member, () => repo.update(link.id, {}, []))).toBeNull();
    expect(await runWithoutTenant(() => prisma.bookingLinkHost.count({ where: { bookingLinkId: link.id } }))).toBe(1);
  });

  it("keys a reserved start per host: two hosts can each take it, one host cannot take it twice", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link } = await teamPage(w, repo);
    const at = future(5);

    const admin = await w.as(w.admin, () => repo.reserve(reservation(link.id, at), open));
    const member = await w.as(w.member, () => repo.reserve(reservation(link.id, at, "bob@example.test"), open));
    const twice = await w.as(w.member, () => repo.reserve(reservation(link.id, at, "cy@example.test"), open));

    expect(admin).toEqual({ id: expect.any(String) });
    expect(member).toEqual({ id: expect.any(String) });
    expect(twice).toBeNull();
    expect(await stored(admin?.id as string)).toMatchObject({ hostUserId: w.admin.id, status: "reserved" });
    expect(await stored(member?.id as string)).toMatchObject({ hostUserId: w.member.id, status: "reserved" });
  });

  it("counts only the current host's bookings as busy and leaves out the booking being moved", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link } = await teamPage(w, repo);
    const at = future(5);
    const window = [future(4), future(6)] as const;

    const adminBooking = await confirmed(w, repo, w.admin, link.id, at);
    await w.as(w.member, () => repo.reserve(reservation(link.id, future(5, 11), "bob@example.test"), open));

    const adminBusy = await w.as(w.admin, () => repo.busyForOwner(...window));
    const memberBusy = await w.as(w.member, () => repo.busyForOwner(...window));

    expect(adminBusy.map((interval) => interval.startsAt)).toEqual([at]);
    expect(memberBusy.map((interval) => interval.startsAt)).toEqual([future(5, 11)]);
    expect(await w.as(w.admin, () => repo.busyForOwner(...window, adminBooking))).toEqual([]);
  });

  it("finds a booking by its manage token with its host and page", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link, token } = await teamPage(w, repo);
    const reserved = await w.as(w.member, () =>
      repo.reserve(reservation(link.id, future(5), "ada@example.test", "lookup-token-1"), open),
    );

    expect(await runWithoutTenant(() => repo.findByManageTokenUnscoped("manage-lookup-token-1"))).toMatchObject({
      id: reserved?.id,
      companyId: w.companyId,
      status: "reserved",
      hostUserId: w.member.id,
      hostName: expect.stringContaining("Member"),
      linkToken: token,
      linkTitle: "Team call",
      linkOwnerId: w.admin.id,
      linkTimeZone: "Europe/Berlin",
      answers: { question: "Pricing" },
      manageToken: "manage-lookup-token-1",
    });
    expect(await runWithoutTenant(() => repo.findByManageTokenUnscoped("manage-unknown"))).toBeNull();
  });
});

describeDatabase("visitors and hosts change a booking", { timeout: 60_000 }, () => {
  it("cancels an upcoming confirmed booking of the current host only, once, and reopens it", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link } = await teamPage(w, repo);
    const id = await confirmed(w, repo, w.admin, link.id, future(5));
    const now = new Date();

    expect(await w.as(w.member, () => repo.cancelHosted(id, "invitee", "No time", now))).toBeNull();
    expect(await stored(id)).toMatchObject({ status: "confirmed" });

    const cancelled = await w.as(w.admin, () => repo.cancelHosted(id, "invitee", "No time", now));
    expect(cancelled).toMatchObject({ id, status: "cancelled", hostUserId: w.admin.id });
    expect(await stored(id)).toMatchObject({
      status: "cancelled",
      cancelledBy: "invitee",
      cancelReason: "No time",
      cancelledAt: now,
    });
    expect(await w.as(w.admin, () => repo.cancelHosted(id, "invitee", null, now))).toBeNull();

    await w.as(w.member, () => repo.reopenHosted(id));
    expect(await stored(id)).toMatchObject({ status: "cancelled" });
    await w.as(w.admin, () => repo.reopenHosted(id));
    expect(await stored(id)).toMatchObject({
      status: "confirmed",
      cancelledBy: null,
      cancelReason: null,
      cancelledAt: null,
    });
  });

  it("does not cancel a booking that already started or is only reserved", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link } = await teamPage(w, repo);
    const started = await confirmed(w, repo, w.admin, link.id, new Date(Date.now() - 60 * 60_000));
    const reserved = await w.as(w.admin, () => repo.reserve(reservation(link.id, future(5)), open));

    expect(await w.as(w.admin, () => repo.cancelHosted(started, "invitee", null, new Date()))).toBeNull();
    expect(
      await w.as(w.admin, () => repo.cancelHosted(reserved?.id as string, "invitee", null, new Date())),
    ).toBeNull();
  });

  it("moves an upcoming booking of the current host when the new time is open, and restores its times", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link } = await teamPage(w, repo);
    const from = future(5);
    const to = { startsAt: future(6), endsAt: new Date(future(6).getTime() + 30 * 60_000) };
    const id = await confirmed(w, repo, w.admin, link.id, from);
    const now = new Date();

    expect(await w.as(w.member, () => repo.moveHosted(id, to, now, open))).toBeNull();
    expect(await w.as(w.admin, () => repo.moveHosted(id, to, now, () => Promise.resolve(false)))).toBeNull();
    expect(await stored(id)).toMatchObject({ startsAt: from, rescheduledAt: null });

    const moved = await w.as(w.admin, () => repo.moveHosted(id, to, now, open));
    expect(moved).toEqual({
      booking: expect.objectContaining({ id, status: "confirmed", ...to, hostUserId: w.admin.id }),
      previousStartsAt: from,
    });
    expect(await stored(id)).toMatchObject({
      ...to,
      rescheduledAt: now,
      status: "confirmed",
      timeZone: "Europe/London",
    });

    await w.as(w.member, () => repo.restoreTimes(id, { startsAt: from, endsAt: new Date(from.getTime() + 1_800_000) }));
    expect(await stored(id)).toMatchObject(to);
    await w.as(w.admin, () => repo.restoreTimes(id, { startsAt: from, endsAt: new Date(from.getTime() + 1_800_000) }));
    expect(await stored(id)).toMatchObject({ startsAt: from, endsAt: new Date(from.getTime() + 1_800_000) });

    const abroad = await w.as(w.admin, () => repo.moveHosted(id, { ...to, timeZone: "America/New_York" }, now, open));
    expect(abroad?.booking).toMatchObject({ ...to, timeZone: "America/New_York" });
    expect(await stored(id)).toMatchObject({ ...to, timeZone: "America/New_York" });
    await w.as(w.admin, () =>
      repo.restoreTimes(id, {
        startsAt: from,
        endsAt: new Date(from.getTime() + 1_800_000),
        timeZone: "Europe/London",
      }),
    );
    expect(await stored(id)).toMatchObject({ startsAt: from, timeZone: "Europe/London" });
  });

  it("does not move a booking that started, was cancelled or is only reserved", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link } = await teamPage(w, repo);
    const to = { startsAt: future(6), endsAt: new Date(future(6).getTime() + 30 * 60_000) };
    const started = await confirmed(w, repo, w.admin, link.id, new Date(Date.now() - 60 * 60_000));
    const cancelled = await confirmed(w, repo, w.admin, link.id, future(7));
    await w.as(w.admin, () => repo.cancelHosted(cancelled, "host", null, new Date()));
    const reserved = await w.as(w.admin, () => repo.reserve(reservation(link.id, future(8)), open));
    const isOpen = vi.fn(open);

    for (const id of [started, cancelled, reserved?.id as string])
      expect(await w.as(w.admin, () => repo.moveHosted(id, to, new Date(), isOpen))).toBeNull();
    expect(isOpen).not.toHaveBeenCalled();
  });

  it("moves and cancels by calendar event only the bookings of that event", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link } = await teamPage(w, repo);
    const keep = await confirmed(w, repo, w.admin, link.id, future(5));
    const target = await confirmed(w, repo, w.member, link.id, future(5), "bob@example.test");
    const { calendarEventId } = await stored(target);
    const later = { startsAt: future(9), endsAt: new Date(future(9).getTime() + 30 * 60_000) };

    const moves = await runWithoutTenant(() =>
      repo.moveForCalendarEventUnscoped({
        companyId: w.companyId,
        calendarEventId: calendarEventId as string,
        ...later,
        now: new Date(),
      }),
    );
    expect(moves.map((move) => [move.booking.id, move.booking.hostUserId])).toEqual([[target, w.member.id]]);
    expect(await stored(keep)).toMatchObject({ startsAt: future(5) });

    const cancelled = await runWithoutTenant(() =>
      repo.cancelForCalendarEventUnscoped({
        companyId: w.companyId,
        calendarEventId: calendarEventId as string,
        now: new Date(),
      }),
    );
    expect(cancelled.map((booking) => booking.id)).toEqual([target]);
    expect(await stored(keep)).toMatchObject({ status: "confirmed" });
  });
});

describeDatabase("booking loads and lists", { timeout: 60_000 }, () => {
  it("counts the upcoming open bookings of each host on one page with the time of the latest", async () => {
    const w = await workspace();
    const repo = new PrismaBookingRepo();
    const { link } = await teamPage(w, repo);
    const other = await teamPage(w, repo);
    await confirmed(w, repo, w.admin, link.id, future(3));
    await confirmed(w, repo, w.admin, link.id, future(4));
    await w.as(w.member, () => repo.reserve(reservation(link.id, future(3), "bob@example.test"), open));
    const cancelled = await confirmed(w, repo, w.member, link.id, future(5), "cy@example.test");
    await w.as(w.member, () => repo.cancelHosted(cancelled, "invitee", null, new Date()));
    await confirmed(w, repo, w.member, link.id, new Date(Date.now() - 2 * DAY_MS), "old@example.test");
    await confirmed(w, repo, w.member, other.link.id, future(6), "elsewhere@example.test");

    const loads = await w.as(w.admin, () => repo.hostLoads(link.id, new Date()));

    expect(loads.sort((left, right) => left.hostUserId.localeCompare(right.hostUserId))).toEqual(
      [
        { hostUserId: w.admin.id, upcoming: 2, lastBookedAt: expect.any(Date) },
        { hostUserId: w.member.id, upcoming: 1, lastBookedAt: expect.any(Date) },
      ].sort((left, right) => left.hostUserId.localeCompare(right.hostUserId)),
    );
  });

  it("lists upcoming confirmed bookings: every booking for the workspace, hosted or own pages for a member", async () => {
    const w = await workspace();
    const elsewhere = await workspace();
    const repo = new PrismaBookingRepo();
    const { link } = await teamPage(w, repo);
    const memberPage = await w.as(w.member, async () =>
      repo.create(
        `token-own-${randomUUID().slice(0, 12)}`,
        linkData((await connectCalendar(w, w.member)).calendar.id, "single"),
        [],
      ),
    );
    const adminHosted = await confirmed(w, repo, w.admin, link.id, future(3));
    const memberHosted = await confirmed(w, repo, w.member, link.id, future(4), "bob@example.test");
    const onMemberPage = await confirmed(w, repo, w.member, memberPage.id, future(2), "cy@example.test");
    await w.as(w.admin, () => repo.reserve(reservation(link.id, future(6)), open));
    const cancelled = await confirmed(w, repo, w.admin, link.id, future(7));
    await w.as(w.admin, () => repo.cancelHosted(cancelled, "host", null, new Date()));
    await confirmed(w, repo, w.admin, link.id, new Date(Date.now() - 2 * DAY_MS));
    const foreign = await teamPage(elsewhere, repo);
    await confirmed(elsewhere, repo, elsewhere.admin, foreign.link.id, future(1));

    const workspaceWide = await w.as(w.admin, () => repo.listUpcoming(new Date(), "workspace", 50));
    const memberHostedList = await w.as(w.member, () => repo.listUpcoming(new Date(), "hosted", 50));
    const adminHostedList = await w.as(w.admin, () => repo.listUpcoming(new Date(), "hosted", 50));
    const limited = await w.as(w.admin, () => repo.listUpcoming(new Date(), "workspace", 2));

    expect(workspaceWide.map((booking) => booking.id)).toEqual([onMemberPage, adminHosted, memberHosted]);
    expect(memberHostedList.map((booking) => booking.id)).toEqual([onMemberPage, memberHosted]);
    expect(adminHostedList.map((booking) => booking.id)).toEqual([adminHosted, memberHosted]);
    expect(limited.map((booking) => booking.id)).toEqual([onMemberPage, adminHosted]);
    expect(workspaceWide[2]).toMatchObject({ hostName: expect.stringContaining("Member"), linkTitle: "Team call" });
  });
});

describeDatabase("calendars of the members who can host", { timeout: 60_000 }, () => {
  it("lists each active member of the workspace with a usable calendar once, with the first calendar by name", async () => {
    const w = await workspace();
    const elsewhere = await workspace();
    const admin = await connectCalendar(w, w.admin);
    const member = await connectCalendar(w, w.member, "ok", "Work");
    const archive = await runWithoutTenant(() =>
      prisma.calendar.create({
        data: {
          companyId: w.companyId,
          connectedAccountId: member.account.id,
          unipileCalendarId: randomUUID(),
          name: "Archive",
        },
      }),
    );
    const gone = await runWithoutTenant(() =>
      prisma.user.create({
        data: {
          companyId: w.companyId,
          roleId: w.member.roleId,
          firstName: "Gone",
          lastName: "Test",
          email: `${randomUUID()}@example.test`,
          status: "inactive",
        },
      }),
    );
    await connectCalendar(w, gone);
    const stale = await runWithoutTenant(() =>
      prisma.user.create({
        data: {
          companyId: w.companyId,
          roleId: w.member.roleId,
          firstName: "Stale",
          lastName: "Test",
          email: `${randomUUID()}@example.test`,
          status: "active",
        },
      }),
    );
    await connectCalendar(w, stale, "permissions");
    await connectCalendar(elsewhere, elsewhere.admin);

    const listed = await w.as(w.member, () => new PrismaCalendarWriteAccessRepo().listMemberCalendars());

    expect(listed).toEqual([
      { userId: w.admin.id, name: "Admin Test", calendarId: admin.calendar.id, calendarName: "Work" },
      { userId: w.member.id, name: "Member Test", calendarId: archive.id, calendarName: "Archive" },
    ]);
  });
});
