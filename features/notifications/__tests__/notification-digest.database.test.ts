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
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { PrismaNotificationRepo } = await import("../prisma-notification.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

const MINUTE_MS = 60_000;

describeDatabase("the notification digest queue", { timeout: 60_000 }, () => {
  const now = new Date("2026-11-16T09:00:00.000Z");
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * MINUTE_MS);

  async function seed() {
    const w = await createRestRouteWorkspace();
    cleanups.push(w.cleanup);
    const add = (
      userId: string,
      createdAt: Date,
      extra: {
        emailedAt?: Date;
        emailedInstantly?: boolean;
        id?: string;
        kind?: "dueToday" | "ruleAlert";
        readAt?: Date;
      } = {},
    ) =>
      runWithoutTenant(() =>
        prisma.notification.create({
          data: { companyId: w.companyId, userId, kind: extra.kind ?? "dueToday", title: "Due", createdAt, ...extra },
        }),
      );
    return { w, add };
  }

  it("lists members oldest waiting first and continues from a cursor until the queue is exhausted", async () => {
    const { w, add } = await seed();
    const newest = await add(w.admin.id, minutesAgo(5));
    const oldest = await add(w.member.id, minutesAgo(50));
    const sameMember = await add(w.member.id, minutesAgo(40));
    const repo = new PrismaNotificationRepo();
    const since = minutesAgo(120);
    type Cursor = { createdAt: Date; id: string };
    const member = { companyId: w.companyId, userId: w.member.id };
    const admin = { companyId: w.companyId, userId: w.admin.id };
    const beforeOwnRows: Cursor = {
      createdAt: new Date(oldest.createdAt.getTime() - 1),
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    };
    const walk = async (limit: number, after: Cursor) => {
      const pages = [];
      let cursor: Cursor | null = after;
      while (cursor) {
        const from: Cursor = cursor;
        const page = await runWithoutTenant(() => repo.findDigestUsersUnscoped({ since, limit, after: from }));
        pages.push(page);
        cursor = page.next;
      }
      return pages;
    };
    const own = (pages: Array<{ users: Array<{ companyId: string; userId: string }> }>) =>
      pages.flatMap((page) => page.users).filter((user) => user.companyId === w.companyId);

    const rowByRow = await walk(1, beforeOwnRows);
    expect(own(rowByRow)).toEqual([member, member, admin]);
    expect(rowByRow.at(-1)).toEqual({ users: [], next: null });
    const atSameMember = rowByRow.find((page) => page.next?.id === sameMember.id)?.next;
    expect(atSameMember).toEqual({ createdAt: sameMember.createdAt, id: sameMember.id });
    expect(own(await walk(1, atSameMember as Cursor))).toEqual([admin]);

    const waiting = await runWithoutTenant(() =>
      prisma.notification.count({ where: { emailedAt: null, readAt: null, createdAt: { gte: oldest.createdAt } } }),
    );
    const onePage = await runWithoutTenant(() =>
      repo.findDigestUsersUnscoped({ since, limit: waiting + 100, after: beforeOwnRows }),
    );
    expect(own([onePage])).toEqual([member, admin]);
    expect(onePage.next).toBeNull();

    await runWithoutTenant(() =>
      repo.markEmailedUnscoped(w.companyId, [oldest.id, sameMember.id, newest.id], now, "digest"),
    );
    expect(own(await walk(1, beforeOwnRows))).toEqual([]);
    expect(own(await walk(2, atSameMember as Cursor))).toEqual([]);
  });

  it("reaches the member behind a page boundary after the boundary row was mailed or deleted", async () => {
    const { w, add } = await seed();
    const other = await createRestRouteWorkspace();
    cleanups.push(other.cleanup);
    const repo = new PrismaNotificationRepo();
    const since = minutesAgo(120);
    const boundary = await add(w.member.id, minutesAgo(50));
    await add(w.admin.id, minutesAgo(40));
    await runWithoutTenant(() =>
      prisma.notification.create({
        data: {
          companyId: other.companyId,
          userId: other.admin.id,
          kind: "dueToday",
          title: "Due",
          createdAt: minutesAgo(30),
        },
      }),
    );
    const inScope = (page: { users: { companyId: string }[] }) =>
      page.users.filter((user) => [w.companyId, other.companyId].includes(user.companyId));

    const first = await runWithoutTenant(() => repo.findDigestUsersUnscoped({ since, limit: 1, after: null }));
    expect(first.next).not.toBeNull();
    let cursor = first.next;
    while (cursor && cursor.id !== boundary.id)
      cursor = (await runWithoutTenant(() => repo.findDigestUsersUnscoped({ since, limit: 1, after: cursor }))).next;
    expect(cursor).toEqual({ createdAt: boundary.createdAt, id: boundary.id });

    await runWithoutTenant(() => repo.markEmailedUnscoped(w.companyId, [boundary.id], now, "digest"));
    const afterMailed = await runWithoutTenant(() =>
      repo.findDigestUsersUnscoped({ since, limit: 500, after: cursor }),
    );
    expect(inScope(afterMailed)).toEqual([
      { companyId: w.companyId, userId: w.admin.id },
      { companyId: other.companyId, userId: other.admin.id },
    ]);

    await runWithoutTenant(() => prisma.notification.delete({ where: { id: boundary.id } }));
    const afterDeleted = await runWithoutTenant(() =>
      repo.findDigestUsersUnscoped({ since, limit: 500, after: cursor }),
    );
    expect(inScope(afterDeleted)).toEqual(inScope(afterMailed));
  });

  it("returns the waiting digest notifications of a member behind more than a hundred of a switched-off kind", async () => {
    const { w, add } = await seed();
    const repo = new PrismaNotificationRepo();
    await runWithoutTenant(() =>
      prisma.notification.createMany({
        data: Array.from({ length: 130 }, (_, index) => ({
          companyId: w.companyId,
          userId: w.member.id,
          kind: "ruleAlert" as const,
          title: `Alert ${index}`,
          createdAt: minutesAgo(600 - index),
        })),
      }),
    );
    const due = await add(w.member.id, minutesAgo(30));
    const held = await add(w.member.id, minutesAgo(5), { kind: "ruleAlert" });
    const selection = { since: minutesAgo(48 * 60), instantBefore: minutesAgo(15) };

    const switchedOff = await runWithoutTenant(() =>
      repo.findUnemailedUnscoped(w.companyId, w.member.id, {
        ...selection,
        digestKinds: ["dueToday"],
        instantKinds: [],
      }),
    );
    expect(switchedOff.map((row) => row.id)).toEqual([due.id]);

    const instant = await runWithoutTenant(() =>
      repo.findUnemailedUnscoped(w.companyId, w.member.id, {
        ...selection,
        digestKinds: ["dueToday"],
        instantKinds: ["ruleAlert"],
      }),
    );
    expect(instant).toHaveLength(100);
    expect(instant.map((row) => row.id)).not.toContain(held.id);
  });

  it("pages the inbox by time and id so rows of one millisecond are neither skipped nor repeated", async () => {
    const { w, add } = await seed();
    const at = minutesAgo(10);
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort();
    for (const id of ids) await add(w.member.id, at, { id });
    const older = await add(w.member.id, minutesAgo(20));
    const repo = new PrismaNotificationRepo();
    const page = (before: { createdAt: Date; id: string | null } | null) =>
      runWithTenant(w.member, () => repo.findInbox({ limit: 2, unreadOnly: false, before }));

    const first = await page(null);
    expect(first.map((row) => row.id)).toEqual(ids.slice(0, 2));
    const second = await page({ createdAt: at, id: first[1].id });
    expect(second.map((row) => row.id)).toEqual([ids[2], older.id]);
  });

  it("leaves out read and already mailed notifications and those older than the window", async () => {
    const { w, add } = await seed();
    await add(w.admin.id, minutesAgo(10), { readAt: now });
    await add(w.admin.id, minutesAgo(10), { emailedAt: now });
    await add(w.member.id, minutesAgo(500));
    const repo = new PrismaNotificationRepo();

    const page = await runWithoutTenant(() =>
      repo.findDigestUsersUnscoped({ since: minutesAgo(120), limit: 500, after: null }),
    );

    expect(page.users.filter((user) => user.companyId === w.companyId)).toEqual([]);
  });

  it("counts the instant mails of the last hour per member, not rows a digest or a pause marked", async () => {
    const { w, add } = await seed();
    const instant = { emailedInstantly: true, kind: "ruleAlert" as const };
    await add(w.admin.id, minutesAgo(90), { ...instant, emailedAt: minutesAgo(30) });
    await add(w.admin.id, minutesAgo(90), { ...instant, emailedAt: minutesAgo(20), kind: "dueToday" });
    await add(w.admin.id, minutesAgo(90), { emailedAt: minutesAgo(10), kind: "ruleAlert" });
    await add(w.admin.id, minutesAgo(200), { ...instant, emailedAt: minutesAgo(90) });
    await add(w.member.id, minutesAgo(90), { ...instant, emailedAt: minutesAgo(5) });
    const pending = await add(w.admin.id, minutesAgo(5));
    const repo = new PrismaNotificationRepo();
    const count = () =>
      runWithoutTenant(() => repo.countInstantEmailsSinceUnscoped(w.companyId, [w.admin.id], minutesAgo(60)));

    expect(await count()).toEqual([{ userId: w.admin.id, count: 2 }]);

    await runWithoutTenant(() => repo.markEmailedUnscoped(w.companyId, [pending.id], now, "digest"));
    expect(await count()).toEqual([{ userId: w.admin.id, count: 2 }]);
    await runWithoutTenant(() => repo.markEmailedUnscoped(w.companyId, [pending.id], now, "instant"));
    expect(await count()).toEqual([{ userId: w.admin.id, count: 3 }]);
    expect(await runWithoutTenant(() => repo.countInstantEmailsSinceUnscoped(w.companyId, [], minutesAgo(60)))).toEqual(
      [],
    );
  });

  it("finds the members whose instant notifications waited past the grace period, by their effective email mode", async () => {
    const { w, add } = await seed();
    const preference = (userId: string, kind: "dueToday" | "ruleAlert", emailMode: "instant" | "digest" | "off") =>
      runWithoutTenant(() =>
        prisma.notificationPreference.create({ data: { companyId: w.companyId, userId, kind, emailMode } }),
      );
    const repo = new PrismaNotificationRepo();
    const find = async (limit = 500) =>
      (
        await runWithoutTenant(() =>
          repo.findInstantFallbackUsersUnscoped({ since: minutesAgo(48 * 60), before: minutesAgo(15), now, limit }),
        )
      ).filter((user) => user.companyId === w.companyId);
    const admin = { companyId: w.companyId, userId: w.admin.id };
    const member = { companyId: w.companyId, userId: w.member.id };

    await add(w.admin.id, minutesAgo(30), { kind: "ruleAlert" });
    await add(w.admin.id, minutesAgo(20), { kind: "ruleAlert" });
    await add(w.member.id, minutesAgo(60), { kind: "dueToday" });
    expect(await find()).toEqual([admin]);

    await preference(w.member.id, "dueToday", "instant");
    expect(await find()).toEqual([member, admin]);
    const limited = await runWithoutTenant(() =>
      repo.findInstantFallbackUsersUnscoped({ since: minutesAgo(48 * 60), before: minutesAgo(15), now, limit: 1 }),
    );
    expect(limited).toHaveLength(1);

    await preference(w.admin.id, "ruleAlert", "digest");
    expect(await find()).toEqual([member]);

    await runWithoutTenant(() =>
      prisma.notificationPause.create({
        data: { companyId: w.companyId, userId: w.member.id, until: minutesAgo(-60), timeZone: "UTC" },
      }),
    );
    expect(await find()).toEqual([]);
    await runWithoutTenant(() =>
      prisma.notificationPause.update({
        where: { companyId_userId: { companyId: w.companyId, userId: w.member.id } },
        data: { until: minutesAgo(1) },
      }),
    );
    expect(await find()).toEqual([member]);
  });

  it("does not offer fresh, old, read or mailed instant notifications to the fallback", async () => {
    const { w, add } = await seed();
    const repo = new PrismaNotificationRepo();
    await add(w.admin.id, minutesAgo(5), { kind: "ruleAlert" });
    await add(w.admin.id, minutesAgo(48 * 60 + 5), { kind: "ruleAlert" });
    await add(w.admin.id, minutesAgo(30), { kind: "ruleAlert", readAt: minutesAgo(10) });
    await add(w.admin.id, minutesAgo(30), { kind: "ruleAlert", emailedAt: minutesAgo(29) });

    const found = await runWithoutTenant(() =>
      repo.findInstantFallbackUsersUnscoped({ since: minutesAgo(48 * 60), before: minutesAgo(15), now, limit: 500 }),
    );

    expect(found.filter((user) => user.companyId === w.companyId)).toEqual([]);
  });

  it("has an index on the creation time alone for the daily prune", async () => {
    const rows = await runWithoutTenant(() =>
      prisma.$queryRaw<
        Array<{ indexdef: string }>
      >`SELECT indexdef FROM pg_indexes WHERE tablename = 'Notification' AND indexname = 'Notification_createdAt_idx'`,
    );

    expect(rows.map((row) => row.indexdef)).toEqual([expect.stringContaining('("createdAt")')]);
  });

  it("marks and reads back only notifications of the workspace it was called for", async () => {
    const { w, add } = await seed();
    const other = await createRestRouteWorkspace();
    cleanups.push(other.cleanup);
    const own = await add(w.admin.id, minutesAgo(5));
    const repo = new PrismaNotificationRepo();
    const emailedAt = (id: string) =>
      runWithoutTenant(async () => (await prisma.notification.findUniqueOrThrow({ where: { id } })).emailedAt);

    await runWithoutTenant(() => repo.markEmailedUnscoped(other.companyId, [own.id], now, "digest"));
    expect(await emailedAt(own.id)).toBeNull();
    await runWithoutTenant(() => repo.markEmailedUnscoped(w.companyId, [own.id], now, "digest"));
    expect(await emailedAt(own.id)).toEqual(now);

    const row = (id: string, companyId: string, userId: string) => ({
      id,
      companyId,
      userId,
      kind: "dueToday" as const,
      title: "Due",
      body: null,
      href: null,
      sourceRuleId: null,
      dedupeKey: null,
    });
    const mine = randomUUID();
    const foreign = randomUUID();
    const stored = await runWithoutTenant(() =>
      repo.insertManyUnscoped(w.companyId, [
        row(mine, w.companyId, w.admin.id),
        row(foreign, other.companyId, other.admin.id),
      ]),
    );

    expect(stored).toEqual([mine]);
    expect(await runWithoutTenant(() => prisma.notification.count({ where: { id: foreign } }))).toBe(0);
    expect(await runWithoutTenant(() => repo.insertManyUnscoped(other.companyId, [row(mine, w.companyId, w.admin.id)]))).toEqual(
      [],
    );
  });
});
