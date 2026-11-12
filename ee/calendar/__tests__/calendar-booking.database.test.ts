import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma";
import type { ActivityKind } from "@/ee/messaging/activities/activities.schema";
import type { RecordActivityIndexRow } from "@/ee/messaging/activities/record-activity-query";

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

async function connectCalendar(w: Workspace, status: "ok" | "permissions" = "ok") {
  return runWithoutTenant(async () => {
    const account = await prisma.connectedAccount.create({
      data: {
        companyId: w.companyId,
        userId: w.admin.id,
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

  it("lets only one visitor reserve a start, frees it on release and on cancelled events", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await w.as(w.admin, () => repo.create("token-b-0123456789abcdef", linkData(calendar.id)));

    const first = await w.as(w.admin, () => repo.reserve(reservation(link.id)));
    const second = await w.as(w.admin, () => repo.reserve(reservation(link.id, START, "bob@example.test")));
    const otherStart = await w.as(w.admin, () =>
      repo.reserve(reservation(link.id, new Date(START.getTime() + 3_600_000))),
    );

    expect(first).toEqual({ id: expect.any(String) });
    expect(second).toBeNull();
    expect(otherStart).toEqual({ id: expect.any(String) });

    await w.as(w.admin, () => repo.release(first?.id as string));
    const again = await w.as(w.admin, () => repo.reserve(reservation(link.id, START, "bob@example.test")));
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
    expect(await w.as(w.admin, () => repo.reserve(reservation(link.id)))).toBeNull();

    await w.as(w.admin, () => repo.cancelForCalendarEvent(event.id));
    expect(await w.as(w.admin, () => repo.reserve(reservation(link.id)))).toEqual({ id: expect.any(String) });
  });

  it("reports busy time and open bookings per email, and ignores stale unconfirmed reservations", async () => {
    const w = await workspace();
    const { calendar } = await connectCalendar(w);
    const repo = new PrismaBookingRepo();
    const link = await w.as(w.admin, () => repo.create("token-c-0123456789abcdef", linkData(calendar.id)));
    const future = new Date(Date.now() + 7 * 86_400_000);
    const stale = new Date(future.getTime() + 86_400_000);
    await w.as(w.admin, () => repo.reserve(reservation(link.id, future)));
    const old = await w.as(w.admin, () => repo.reserve(reservation(link.id, stale, "old@example.test")));
    await runWithoutTenant(() =>
      prisma.booking.update({
        where: { id: old?.id as string },
        data: { createdAt: new Date(Date.now() - 3_600_000) },
      }),
    );

    const busy = await w.as(w.admin, () => repo.busyForOwner(new Date(), new Date(stale.getTime() + 86_400_000)));
    const open = await w.as(w.admin, () => repo.countOpenForEmail(link.id, "ada@example.test", new Date()));
    const replaced = await w.as(w.admin, () => repo.reserve(reservation(link.id, stale, "new@example.test")));

    expect(busy).toHaveLength(1);
    expect(busy[0].startsAt).toEqual(future);
    expect(open).toBe(1);
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
});
