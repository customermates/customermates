import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma";
import type { ActivityKind } from "@/ee/messaging/activities/activities.schema";
import type { RecordActivityIndexRow } from "@/ee/messaging/activities/record-activity-query";
import type { CalendarEventCore } from "../calendar.schema";

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
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PermissionService } = await import("@/core/base/permission.service");
const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { PrismaBillingUsageRepo } = await import("@/features/billing-usage/prisma-billing-usage.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { PrismaBookingRepo } = await import("../prisma-booking.repository");
const { PrismaCalendarEventLinkRepo } = await import("../prisma-calendar-event-link.repository");
const { PrismaCalendarRepo } = await import("../prisma-calendar.repository");
const { PrismaCalendarWriteAccessRepo } = await import("../prisma-calendar-write-access.repository");
const { PrismaPlannerPersonalEventsRepo } = await import("../prisma-planner-personal-events.repository");
const { PrismaOwnBusyEventsRepo } = await import("../prisma-own-busy-events.repository");
const { BusyTimeReader } = await import("../busy-time.reader");
const { DEFAULT_WORKING_HOURS } = await import("../working-hours");
const { compileRecordActivityIndex } = await import("@/ee/messaging/activities/record-activity-query");
const { RecordActivitiesInputSchema } = await import("@/ee/messaging/activities/record-activities.schema");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

type Workspace = Awaited<ReturnType<typeof createRestRouteWorkspace>>;

async function workspace(): Promise<Workspace> {
  const created = await createRestRouteWorkspace();
  cleanups.push(created.cleanup);
  return created;
}

async function connectCalendar(w: Workspace, status: "ok" | "permissions" = "ok", owner: { id: string } = w.admin) {
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
        emailAddress: "owner@example.test",
      },
    });
    const calendar = await prisma.calendar.create({
      data: { companyId: w.companyId, connectedAccountId: account.id, unipileCalendarId: randomUUID(), name: "Work" },
    });
    return { account, calendar };
  });
}

const START = new Date("2030-01-15T09:00:00.000Z");
const END = new Date("2030-01-15T09:30:00.000Z");

function linkData(calendarId: string) {
  return {
    calendarId,
    title: "Intro call",
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
  };
}

function reservation(bookingLinkId: string, startsAt = START, email = "ada@example.test") {
  return {
    bookingLinkId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 60_000),
    inviteeName: "Ada",
    inviteeEmail: email,
    timeZone: "Europe/London",
    answers: { question: "Pricing" },
    ipHash: "hash",
  };
}

const open = () => Promise.resolve(true);

describeDatabase("booking links and reservations", { timeout: 60_000 }, () => {
  it("creates, lists, updates and deletes a link of the caller only", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();

    const created = await w.as(w.admin, () => repo.create("token-a-0123456789abcdef", linkData(calendar.id)));
    const listed = await w.as(w.admin, () => repo.list());
    const foreign = await w.as(w.member, () => repo.list());
    const updated = await w.as(w.admin, () => repo.update(created.id, { enabled: false, title: "Renamed" }));
    const lookup = await runWithoutTenant(() => repo.findByTokenUnscoped("token-a-0123456789abcdef"));

    expect(listed.map((row) => row.id)).toEqual([created.id]);
    expect(foreign).toEqual([]);
    expect(updated).toMatchObject({ enabled: false, title: "Renamed", calendarName: "Work" });
    expect(lookup).toMatchObject({
      id: created.id,
      accountUsable: true,
      hostName: expect.stringContaining("Admin"),
      unipileCalendarId: expect.any(String),
    });
    expect(await w.as(w.member, () => repo.delete(created.id))).toBe(false);
    expect(await w.as(w.admin, () => repo.delete(created.id))).toBe(true);
    expect(await w.as(w.admin, () => repo.countOwn())).toBe(0);
  });

  it("keeps a booking page, its public address and its bookings when its calendar account is disconnected", async () => {
    const w = await workspace();
    const { account, calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const token = `token-gone-${randomUUID().slice(0, 12)}`;
    const link = await w.as(w.admin, () => repo.create(token, linkData(calendar.id)));
    const booked = await w.as(w.admin, () => repo.reserve(reservation(link.id), open));
    await w.as(w.admin, () =>
      repo.confirm(booked?.id ?? "", {
        calendarEventId: null as never,
        personTypeId: null,
        personRecordId: null,
        recordTypeId: null,
        recordId: null,
      }),
    );

    await runWithoutTenant(() => prisma.connectedAccount.delete({ where: { id: account.id } }));

    const [kept] = await w.as(w.admin, () => repo.list());
    expect(kept).toMatchObject({ id: link.id, token, calendarId: null, calendarName: null, enabled: true });
    expect((await w.as(w.admin, () => repo.listWorkspace())).map((row) => row.calendarId)).toEqual([null]);
    expect(await runWithoutTenant(() => prisma.booking.count({ where: { bookingLinkId: link.id } }))).toBe(1);
    expect(await runWithoutTenant(() => repo.findByTokenUnscoped(token))).toBeNull();
    expect(await w.as(w.admin, () => repo.update(link.id, { enabled: false }))).toMatchObject({
      calendarId: null,
      enabled: false,
    });

    const again = await connectCalendar(w);
    const chosen = await w.as(w.admin, () => repo.update(link.id, { calendarId: again.calendar.id, enabled: true }));
    expect(chosen).toMatchObject({ id: link.id, token, calendarId: again.calendar.id, calendarName: "Work" });
    expect(await runWithoutTenant(() => repo.findByTokenUnscoped(token))).toMatchObject({
      id: link.id,
      calendarId: again.calendar.id,
      accountUsable: true,
    });
  });

  it("keeps a booking page when only its calendar is deleted at the provider", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await w.as(w.admin, () =>
      repo.create(`token-cal-${randomUUID().slice(0, 12)}`, linkData(calendar.id)),
    );

    await runWithoutTenant(() => prisma.calendar.delete({ where: { id: calendar.id } }));

    expect(await w.as(w.admin, () => repo.find(link.id))).toMatchObject({ id: link.id, calendarId: null });
  });

  it("lists the links of the whole workspace with their owners and never those of another workspace", async () => {
    const w = await workspace();
    const elsewhere = await workspace();
    const mine = await connectCalendar(w);
    const colleague = await connectCalendar(w, "ok", w.member);
    const foreign = await connectCalendar(elsewhere);
    const repo = new PrismaBookingRepo();

    const own = await w.as(w.admin, () => repo.create("token-w1-0123456789abcdef", linkData(mine.calendar.id)));
    const theirs = await w.as(w.member, () =>
      repo.create("token-w2-0123456789abcdef", { ...linkData(colleague.calendar.id), title: "Support" }),
    );
    await elsewhere.as(elsewhere.admin, () => repo.create("token-w3-0123456789abcdef", linkData(foreign.calendar.id)));

    const workspaceWide = await w.as(w.admin, () => repo.listWorkspace());

    expect(workspaceWide.map((row) => [row.id, row.userId])).toEqual([
      [own.id, w.admin.id],
      [theirs.id, w.member.id],
    ]);
    expect(workspaceWide.map((row) => row.ownerName)).toEqual([
      expect.stringContaining("Admin"),
      expect.stringContaining("Member"),
    ]);
    expect(workspaceWide[1]).toMatchObject({ title: "Support", calendarName: "Work", upcomingBookings: 0 });
    expect((await w.as(w.admin, () => repo.list())).map((row) => row.id)).toEqual([own.id]);
    expect((await elsewhere.as(elsewhere.admin, () => repo.listWorkspace())).map((row) => row.userId)).toEqual([
      elsewhere.admin.id,
    ]);
  });

  it("lets only one visitor reserve a start, frees it on release and on cancelled events", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await w.as(w.admin, () => repo.create("token-b-0123456789abcdef", linkData(calendar.id)));

    const first = await w.as(w.admin, () => repo.reserve(reservation(link.id), open));
    const second = await w.as(w.admin, () => repo.reserve(reservation(link.id, START, "bob@example.test"), open));
    const otherStart = await w.as(w.admin, () =>
      repo.reserve(reservation(link.id, new Date(START.getTime() + 3_600_000)), open),
    );

    expect(first).toEqual({ id: expect.any(String) });
    expect(second).toBeNull();
    expect(otherStart).toEqual({ id: expect.any(String) });

    await w.as(w.admin, () => repo.release(first?.id as string));
    const again = await w.as(w.admin, () => repo.reserve(reservation(link.id, START, "bob@example.test"), open));
    expect(again).toEqual({ id: expect.any(String) });

    const event = await runWithoutTenant(() =>
      prisma.calendarEvent.create({
        data: {
          companyId: w.companyId,
          connectedAccountId: calendar.connectedAccountId,
          calendarId: calendar.id,
          unipileEventId: randomUUID(),
          title: "Intro call",
          startsAt: START,
          endsAt: END,
        },
      }),
    );
    await w.as(w.admin, () =>
      repo.confirm(again?.id as string, {
        calendarEventId: event.id,
        personTypeId: null,
        personRecordId: null,
        recordTypeId: null,
        recordId: null,
      }),
    );
    expect(
      await runWithoutTenant(() => prisma.booking.findUnique({ where: { id: again?.id as string } })),
    ).toMatchObject({ status: "confirmed", slotKey: null, calendarEventId: event.id });
    expect(await w.as(w.admin, () => repo.reserve(reservation(link.id), () => Promise.resolve(false)))).toBeNull();
    expect(await w.as(w.admin, () => repo.cancelForCalendarEvent(event.id))).toBeUndefined();
    expect(await w.as(w.admin, () => repo.reserve(reservation(link.id), open))).toEqual({ id: expect.any(String) });
  });

  it("reports busy time and open bookings per email, and ignores stale unconfirmed reservations", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await w.as(w.admin, () => repo.create("token-c-0123456789abcdef", linkData(calendar.id)));
    const future = new Date(Date.now() + 7 * 86_400_000);
    const stale = new Date(future.getTime() + 86_400_000);
    await w.as(w.admin, () => repo.reserve(reservation(link.id, future), open));
    const old = await w.as(w.admin, () => repo.reserve(reservation(link.id, stale, "old@example.test"), open));
    await runWithoutTenant(() =>
      prisma.booking.update({
        where: { id: old?.id as string },
        data: { createdAt: new Date(Date.now() - 3_600_000) },
      }),
    );

    const busy = await w.as(w.admin, () => repo.busyForOwner(new Date(), new Date(stale.getTime() + 86_400_000)));
    const openCount = await w.as(w.admin, () => repo.countOpenForEmail(link.id, "ada@example.test", new Date()));
    const replaced = await w.as(w.admin, () => repo.reserve(reservation(link.id, stale, "new@example.test"), open));

    expect(busy).toHaveLength(1);
    expect(busy[0].startsAt).toEqual(future);
    expect(openCount).toBe(1);
    expect(replaced).toEqual({ id: expect.any(String) });
  });
});

describeDatabase("calendar write access and event record links", { timeout: 60_000 }, () => {
  it("offers only the caller's own usable calendars and counts accounts that need a reconnect", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    await connectCalendar(w, "permissions");
    const access = new PrismaCalendarWriteAccessRepo();

    const own = await w.as(w.admin, () => access.listOwnCalendars());
    const other = await w.as(w.member, () => access.listOwnCalendars());

    expect(own.calendars.map((row) => row.id)).toEqual([calendar.id]);
    expect(own.accountsNeedingReconnect).toBe(1);
    expect(other).toEqual({ calendars: [], accountsNeedingReconnect: 0 });
    expect(await w.as(w.member, () => access.findOwnCalendar(calendar.id))).toBeNull();
    expect(await w.as(w.admin, () => access.findOwnCalendar(calendar.id))).toMatchObject({ id: calendar.id });
  });

  it("links an event to records, lists the links, and marks the event cancelled", async () => {
    const w = await workspace();
    const { account, calendar } = await connectCalendar(w);
    const organization = await w.create("organization", "organization.name", "Acme");
    const calendars = new PrismaCalendarRepo();
    const links = new PrismaCalendarEventLinkRepo();
    const access = new PrismaCalendarWriteAccessRepo();
    const unipileEventId = randomUUID();

    const stored = await calendars.upsertCalendarEventUnscoped({
      companyId: w.companyId,
      connectedAccountId: account.id,
      calendarId: calendar.id,
      attendeeEmails: [],
      event: {
        unipileEventId,
        title: "Intro call",
        description: null,
        location: null,
        conferenceUrl: null,
        startsAt: START,
        endsAt: END,
        allDay: false,
        timezone: "UTC",
        recurrenceRule: null,
        status: "confirmed",
        visibility: null,
        transparency: null,
        attendees: [],
        organizer: null,
      },
    });
    await w.as(w.admin, () => links.linkRecords(stored.id, [organization, organization]));

    expect((await w.as(w.admin, () => links.listLinks([stored.id]))).get(stored.id)).toEqual([organization]);
    expect(await w.as(w.admin, () => access.findOwnEvent(stored.id))).toMatchObject({ id: stored.id, unipileEventId });

    await calendars.markCalendarEventCancelledUnscoped({ connectedAccountId: account.id, unipileEventId });
    expect(
      await runWithoutTenant(() => prisma.calendarEvent.findUniqueOrThrow({ where: { id: stored.id } })),
    ).toMatchObject({ status: "cancelled" });
  });

  it("shows an event linked to a record on that record's activity timeline", async () => {
    const w = await workspace();
    const { account, calendar } = await connectCalendar(w);
    const organization = await w.create("organization", "organization.name", "Acme");
    const other = await w.create("organization", "organization.name", "Other");
    const links = new PrismaCalendarEventLinkRepo();
    const make = () =>
      runWithoutTenant(() =>
        prisma.calendarEvent.create({
          data: {
            companyId: w.companyId,
            connectedAccountId: account.id,
            calendarId: calendar.id,
            unipileEventId: randomUUID(),
            title: "Linked",
            startsAt: START,
            endsAt: END,
          },
        }),
      );
    const linked = await make();
    const unlinked = await make();
    await w.as(w.admin, () => links.linkRecords(linked.id, [organization]));

    const repo = createTestRecordRepo();
    const index = async (ref: typeof organization) =>
      w.as(w.admin, () =>
        runInTransaction(async () => {
          const policy = await new RecordAccessPolicy(
            new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo()),
            repo,
          ).load();
          const model = await repo.getModel();
          const available: ActivityKind[] = ["calendar_event"];
          const input = RecordActivitiesInputSchema.parse({
            scope: { records: [ref], typeIds: [] },
            kinds: ["calendar_event"],
            limit: 100,
          });
          const query: Prisma.Sql = compileRecordActivityIndex(
            w.companyId,
            w.admin.id,
            input,
            model,
            policy.access(model.types.map((type) => type.id)),
            available,
          );
          const rows = await prisma.$queryRaw<RecordActivityIndexRow[]>(query);
          return rows.map((row) => row.id);
        }),
      );

    expect(await index(organization)).toEqual([linked.id]);
    expect(await index(other)).toEqual([]);
    expect(unlinked.id).not.toBe(linked.id);
  });

  it("stores the free or busy mark of the provider and blocks a booking page only for busy entries", async () => {
    const w = await workspace();
    const { account, calendar } = await connectCalendar(w);
    const calendars = new PrismaCalendarRepo();
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    const sync = (title: string, event: Partial<CalendarEventCore>) =>
      calendars.upsertCalendarEventUnscoped({
        companyId: w.companyId,
        connectedAccountId: account.id,
        calendarId: calendar.id,
        attendeeEmails: [],
        event: {
          unipileEventId: `mark-${title}`,
          title,
          description: null,
          location: null,
          conferenceUrl: null,
          startsAt: START,
          endsAt: END,
          allDay: false,
          timezone: "Europe/Berlin",
          recurrenceRule: null,
          status: "confirmed",
          visibility: null,
          transparency: null,
          attendees: [],
          organizer: null,
          ...event,
        },
      });
    const allDay = { allDay: true, startsAt: day("2030-01-16"), endsAt: day("2030-01-17") };

    await sync("timed busy", { transparency: "opaque" });
    await sync("timed free", {
      transparency: "transparent",
      startsAt: new Date("2030-01-15T11:00:00.000Z"),
      endsAt: new Date("2030-01-15T12:00:00.000Z"),
    });
    await sync("timed unmarked", {
      startsAt: new Date("2030-01-15T13:00:00.000Z"),
      endsAt: new Date("2030-01-15T14:00:00.000Z"),
    });
    await sync("day busy", { ...allDay, transparency: "opaque" });
    await sync("day free", { ...allDay, transparency: "transparent" });
    await sync("day unmarked", { ...allDay, startsAt: day("2030-01-18"), endsAt: day("2030-01-19") });
    const moved = await sync("day free", { ...allDay, transparency: "opaque", timezone: "America/New_York" });

    const rows = await runWithoutTenant(() =>
      prisma.calendarEvent.findMany({
        where: { calendarId: calendar.id },
        select: { id: true, title: true, transparency: true },
        orderBy: { title: "asc" },
      }),
    );
    expect(rows.map((row) => [row.title, row.transparency])).toEqual([
      ["day busy", "opaque"],
      ["day free", "opaque"],
      ["day unmarked", null],
      ["timed busy", "opaque"],
      ["timed free", "transparent"],
      ["timed unmarked", null],
    ]);
    expect(rows.find((row) => row.title === "day free")?.id).toBe(moved.id);

    const reader = new BusyTimeReader(new PrismaOwnBusyEventsRepo());
    const read = (from: string, to: string) =>
      w.as(w.admin, async () =>
        (await reader.read(new Date(from), new Date(to), "Europe/Berlin"))
          .map((interval) => `${interval.startsAt.toISOString()} ${interval.endsAt.toISOString()}`)
          .sort(),
      );

    expect(await read("2030-01-15T00:00:00.000Z", "2030-01-19T00:00:00.000Z")).toEqual([
      "2030-01-15T09:00:00.000Z 2030-01-15T09:30:00.000Z",
      "2030-01-15T13:00:00.000Z 2030-01-15T14:00:00.000Z",
      "2030-01-15T23:00:00.000Z 2030-01-16T23:00:00.000Z",
      "2030-01-16T05:00:00.000Z 2030-01-17T05:00:00.000Z",
    ]);
    expect(await read("2030-01-17T00:30:00.000Z", "2030-01-17T04:00:00.000Z")).toEqual([
      "2030-01-15T23:00:00.000Z 2030-01-16T23:00:00.000Z",
      "2030-01-16T05:00:00.000Z 2030-01-17T05:00:00.000Z",
    ]);
    expect(await w.as(w.member, () => reader.read(day("2030-01-15"), day("2030-01-19"), "Europe/Berlin"))).toEqual([]);
  });

  it("blocks a booking page only for the owner's own accounts, not for an account a colleague shared", async () => {
    const w = await workspace();
    const own = await connectCalendar(w);
    const colleague = await connectCalendar(w, "ok", w.member);
    await runWithoutTenant(() =>
      prisma.connectedAccount.update({ where: { id: colleague.account.id }, data: { shared: true } }),
    );
    const meeting = (target: typeof own, title: string, startsAt: Date) =>
      runWithoutTenant(() =>
        prisma.calendarEvent.create({
          data: {
            companyId: w.companyId,
            connectedAccountId: target.account.id,
            calendarId: target.calendar.id,
            unipileEventId: randomUUID(),
            title,
            startsAt,
            endsAt: new Date(startsAt.getTime() + 30 * 60_000),
            transparency: "opaque",
          },
        }),
      );
    await meeting(own, "Own", START);
    await meeting(colleague, "Colleague", new Date("2030-01-15T11:00:00.000Z"));

    const window = [new Date("2030-01-15T00:00:00.000Z"), new Date("2030-01-16T00:00:00.000Z")] as const;
    const starts = (repo: InstanceType<typeof PrismaPlannerPersonalEventsRepo>) =>
      w.as(w.admin, async () =>
        (await new BusyTimeReader(repo).read(...window, "Europe/Berlin")).map((interval) =>
          interval.startsAt.toISOString(),
        ),
      );

    expect(await starts(new PrismaPlannerPersonalEventsRepo())).toEqual([
      "2030-01-15T09:00:00.000Z",
      "2030-01-15T11:00:00.000Z",
    ]);
    expect(await starts(new PrismaOwnBusyEventsRepo())).toEqual(["2030-01-15T09:00:00.000Z"]);
  });

  it("keeps a meeting the app created busy when the provider marks it free", async () => {
    const w = await workspace();
    const { account, calendar } = await connectCalendar(w);
    const organization = await w.create("organization", "organization.name", "Acme");
    const repo = new PrismaBookingRepo();
    const link = await w.as(w.admin, () =>
      repo.create(`token-busy-${randomUUID().slice(0, 12)}`, linkData(calendar.id)),
    );
    const free = (title: string, hour: number) =>
      runWithoutTenant(() =>
        prisma.calendarEvent.create({
          data: {
            companyId: w.companyId,
            connectedAccountId: account.id,
            calendarId: calendar.id,
            unipileEventId: randomUUID(),
            title,
            startsAt: new Date(Date.UTC(2030, 0, 15, hour)),
            endsAt: new Date(Date.UTC(2030, 0, 15, hour, 30)),
            transparency: "transparent",
          },
        }),
      );
    const synced = await free("Synced and free", 8);
    const scheduled = await free("Scheduled from a record", 10);
    const booked = await free("Booked on a page", 12);
    await w.as(w.admin, () => new PrismaCalendarEventLinkRepo().linkRecords(scheduled.id, [organization]));
    const reserved = await w.as(w.admin, () =>
      repo.reserve(reservation(link.id, new Date(Date.UTC(2030, 0, 15, 12))), open),
    );
    await w.as(w.admin, () =>
      repo.confirm(reserved?.id as string, {
        calendarEventId: booked.id,
        personTypeId: null,
        personRecordId: null,
        recordTypeId: null,
        recordId: null,
      }),
    );

    const busy = await w.as(w.admin, async () =>
      (
        await new BusyTimeReader(new PrismaOwnBusyEventsRepo()).read(
          new Date("2030-01-15T00:00:00.000Z"),
          new Date("2030-01-16T00:00:00.000Z"),
          "Europe/Berlin",
        )
      ).map((interval) => interval.startsAt.toISOString()),
    );

    expect(busy).toEqual(["2030-01-15T10:00:00.000Z", "2030-01-15T12:00:00.000Z"]);
    expect(synced.id).not.toBe(scheduled.id);
  });
});

type Interval = { startsAt: Date; endsAt: Date };

function freeOfOwnerBookings(
  repo: { busyForOwner(from: Date, to: Date): Promise<Interval[]> },
  { startsAt, endsAt }: Interval,
) {
  return async () => {
    const busy = await repo.busyForOwner(
      new Date(startsAt.getTime() - 86_400_000),
      new Date(endsAt.getTime() + 86_400_000),
    );
    return busy.every((interval) => interval.endsAt <= startsAt || interval.startsAt >= endsAt);
  };
}

describeDatabase("booking slots follow the calendar", { timeout: 60_000 }, () => {
  function createLink(w: Workspace, calendarId: string, token: string) {
    const data: Record<string, unknown> = { ...linkData(calendarId) };
    delete data.personRelationshipId;
    return runWithoutTenant(() =>
      prisma.bookingLink.create({
        data: { ...data, companyId: w.companyId, userId: w.admin.id, token } as never,
        select: { id: true },
      }),
    );
  }

  async function bookedEvent(w: Workspace, repo: InstanceType<typeof PrismaBookingRepo>, linkId: string) {
    const { account, calendar } = await connectCalendar(w);
    const event = await runWithoutTenant(() =>
      prisma.calendarEvent.create({
        data: {
          companyId: w.companyId,
          connectedAccountId: account.id,
          calendarId: calendar.id,
          unipileEventId: randomUUID(),
          title: "Intro call",
          startsAt: START,
          endsAt: END,
        },
      }),
    );
    const reserved = await w.as(w.admin, () => repo.reserve(reservation(linkId), open));
    await w.as(w.admin, () =>
      repo.confirm(reserved?.id as string, {
        calendarEventId: event.id,
        personTypeId: null,
        personRecordId: null,
        recordTypeId: null,
        recordId: null,
      }),
    );
    return { event, bookingId: reserved?.id as string };
  }

  const stored = (bookingId: string) =>
    runWithoutTenant(() => prisma.booking.findUniqueOrThrow({ where: { id: bookingId } }));

  it("counts only in-flight reservations as busy and drops a booking from busy time once it is confirmed", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await createLink(w, calendar.id, "token-d-0123456789abcdef");
    const reserved = await w.as(w.admin, () => repo.reserve(reservation(link.id), open));
    const window = [new Date("2030-01-14T00:00:00.000Z"), new Date("2030-01-16T00:00:00.000Z")] as const;

    expect(await w.as(w.admin, () => repo.busyForOwner(...window))).toHaveLength(1);

    await w.as(w.admin, () =>
      repo.confirm(reserved?.id as string, {
        calendarEventId: randomUUID(),
        personTypeId: null,
        personRecordId: null,
        recordTypeId: null,
        recordId: null,
      }),
    );

    expect(await w.as(w.admin, () => repo.busyForOwner(...window))).toEqual([]);
    expect(await stored(reserved?.id as string)).toMatchObject({ status: "confirmed", slotKey: null });
  });

  it("cancels a booking when its event is deleted or moved, and keeps it while the event still sits at the booked time", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await createLink(w, calendar.id, "token-e-0123456789abcdef");
    const { event, bookingId } = await bookedEvent(w, repo, link.id);

    const unchanged = await runWithoutTenant(() =>
      repo.cancelForCalendarEventUnscoped({
        companyId: w.companyId,
        calendarEventId: event.id,
        stillAt: { startsAt: START, endsAt: END },
      }),
    );
    expect(unchanged).toBe(0);
    expect(await stored(bookingId)).toMatchObject({ status: "confirmed" });

    const moved = await runWithoutTenant(() =>
      repo.cancelForCalendarEventUnscoped({
        companyId: w.companyId,
        calendarEventId: event.id,
        stillAt: { startsAt: new Date(START.getTime() + 3_600_000), endsAt: new Date(END.getTime() + 3_600_000) },
      }),
    );
    expect(moved).toBe(1);
    expect(await stored(bookingId)).toMatchObject({ status: "cancelled", slotKey: null });
    expect(await w.as(w.admin, () => repo.countOpenForEmail(link.id, "ada@example.test", new Date(0)))).toBe(0);
  });

  it("cancels every open booking of a deleted event, for its own workspace only", async () => {
    const w = await workspace();
    const other = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await createLink(w, calendar.id, "token-f-0123456789abcdef");
    const { event, bookingId } = await bookedEvent(w, repo, link.id);

    const foreign = await runWithoutTenant(() =>
      repo.cancelForCalendarEventUnscoped({ companyId: other.companyId, calendarEventId: event.id }),
    );
    expect(foreign).toBe(0);
    expect(await stored(bookingId)).toMatchObject({ status: "confirmed" });

    const own = await runWithoutTenant(() =>
      repo.cancelForCalendarEventUnscoped({ companyId: w.companyId, calendarEventId: event.id }),
    );
    expect(own).toBe(1);
    expect(await stored(bookingId)).toMatchObject({ status: "cancelled" });
    expect(await w.as(w.admin, () => repo.reserve(reservation(link.id), open))).toEqual({ id: expect.any(String) });
  });

  it("lets only one of two overlapping reservations of one owner through", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await createLink(w, calendar.id, "token-g-0123456789abcdef");
    const first = reservation(link.id, START, "ada@example.test");
    const second = reservation(link.id, new Date(START.getTime() + 15 * 60_000), "bob@example.test");

    const results = await Promise.all([
      w.as(w.admin, () => repo.reserve(first, freeOfOwnerBookings(repo, first))),
      w.as(w.admin, () => repo.reserve(second, freeOfOwnerBookings(repo, second))),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it("lets only one of two reservations for the same start through when they come from two links of one owner", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const linkA = await createLink(w, calendar.id, "token-h-0123456789abcdef");
    const linkB = await createLink(w, calendar.id, "token-i-0123456789abcdef");
    const first = reservation(linkA.id, START, "ada@example.test");
    const second = reservation(linkB.id, START, "bob@example.test");

    const results = await Promise.all([
      w.as(w.admin, () => repo.reserve(first, freeOfOwnerBookings(repo, first))),
      w.as(w.admin, () => repo.reserve(second, freeOfOwnerBookings(repo, second))),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it("books both when the slots do not overlap", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await createLink(w, calendar.id, "token-j-0123456789abcdef");
    const first = reservation(link.id, START, "ada@example.test");
    const second = reservation(link.id, new Date(START.getTime() + 3_600_000), "bob@example.test");

    const results = await Promise.all([
      w.as(w.admin, () => repo.reserve(first, freeOfOwnerBookings(repo, first))),
      w.as(w.admin, () => repo.reserve(second, freeOfOwnerBookings(repo, second))),
    ]);

    expect(results.every((result) => result !== null)).toBe(true);
  });

  it("counts the bookings of one visitor on one link since a time", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await createLink(w, calendar.id, "token-k-0123456789abcdef");
    const other = await createLink(w, calendar.id, "token-l-0123456789abcdef");
    await w.as(w.admin, () => repo.reserve({ ...reservation(link.id), ipHash: "visitor-a" }, open));
    await w.as(w.admin, () =>
      repo.reserve({ ...reservation(link.id, new Date(START.getTime() + 3_600_000)), ipHash: "visitor-a" }, open),
    );
    await w.as(w.admin, () =>
      repo.reserve({ ...reservation(link.id, new Date(START.getTime() + 7_200_000)), ipHash: "visitor-b" }, open),
    );
    await w.as(w.admin, () => repo.reserve({ ...reservation(other.id), ipHash: "visitor-a" }, open));
    const hourAgo = new Date(Date.now() - 3_600_000);

    expect(await w.as(w.admin, () => repo.countForVisitorSince(link.id, "visitor-a", hourAgo))).toBe(2);
    expect(await w.as(w.admin, () => repo.countForVisitorSince(link.id, "visitor-b", hourAgo))).toBe(1);
    expect(
      await w.as(w.admin, () => repo.countForVisitorSince(link.id, "visitor-a", new Date(Date.now() + 60_000))),
    ).toBe(0);
    expect(await w.as(w.admin, () => repo.countForLinkSince(link.id, hourAgo))).toBe(3);
    expect(await w.as(w.admin, () => repo.countForLinkSince(other.id, hourAgo))).toBe(1);
    expect(await w.as(w.admin, () => repo.countForLinkSince(link.id, new Date(Date.now() + 60_000)))).toBe(0);
  });

  it("prunes bookings that ended long ago and abandoned reservations, in batches, and keeps the rest", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await createLink(w, calendar.id, "token-m-0123456789abcdef");
    const now = Date.now();
    const day = 86_400_000;
    const row = (email: string, endsAt: Date, status: "reserved" | "confirmed" | "cancelled", createdAt = new Date()) =>
      runWithoutTenant(() =>
        prisma.booking.create({
          data: {
            companyId: w.companyId,
            bookingLinkId: link.id,
            status,
            inviteeName: "Ada",
            inviteeEmail: email,
            startsAt: new Date(endsAt.getTime() - 30 * 60_000),
            endsAt,
            timeZone: "UTC",
            createdAt,
          },
        }),
      );
    const ended = await row("ended@example.test", new Date(now - 100 * day), "confirmed");
    const endedCancelled = await row("cancelled@example.test", new Date(now - 95 * day), "cancelled");
    const abandoned = await row("abandoned@example.test", new Date(now + 5 * day), "reserved", new Date(now - 2 * day));
    const recent = await row("recent@example.test", new Date(now - 10 * day), "confirmed");
    const upcoming = await row("upcoming@example.test", new Date(now + 5 * day), "confirmed");
    const fresh = await row("fresh@example.test", new Date(now + 6 * day), "reserved");
    const cutoffs = { endedBefore: new Date(now - 90 * day), abandonedBefore: new Date(now - day) };

    const first = await repo.deleteExpiredUnscoped(cutoffs, 2);
    const second = await repo.deleteExpiredUnscoped(cutoffs, 2);
    const third = await repo.deleteExpiredUnscoped(cutoffs, 2);

    expect([first, second, third]).toEqual([2, 1, 0]);
    const left = await runWithoutTenant(() =>
      prisma.booking.findMany({ where: { companyId: w.companyId }, select: { id: true } }),
    );
    expect(left.map((booking) => booking.id).sort()).toEqual([recent.id, upcoming.id, fresh.id].sort());
    expect([ended.id, endedCancelled.id, abandoned.id].some((id) => left.some((booking) => booking.id === id))).toBe(
      false,
    );
  });

  it("has an index on the end time alone for the daily prune of bookings", async () => {
    const rows = await runWithoutTenant(() =>
      prisma.$queryRaw<
        Array<{ indexdef: string }>
      >`SELECT indexdef FROM pg_indexes WHERE tablename = 'Booking' AND indexname = 'Booking_endsAt_idx'`,
    );

    expect(rows.map((row) => row.indexdef)).toEqual([expect.stringContaining('("endsAt")')]);
  });
});
