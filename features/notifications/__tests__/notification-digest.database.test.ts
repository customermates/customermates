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
      extra: { emailedAt?: Date; kind?: "dueToday" | "ruleAlert"; readAt?: Date } = {},
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

    const first = await runWithoutTenant(() => repo.findDigestUsersUnscoped({ since, limit: 2, after: null }));
    expect(first.users).toEqual([{ companyId: w.companyId, userId: w.member.id }]);
    expect(first.next).toBe(sameMember.id);

    const second = await runWithoutTenant(() => repo.findDigestUsersUnscoped({ since, limit: 2, after: first.next }));
    expect(second.users).toEqual([{ companyId: w.companyId, userId: w.admin.id }]);
    expect(second.next).toBeNull();

    await runWithoutTenant(() => repo.markEmailedUnscoped([oldest.id, sameMember.id, newest.id], now));
    const afterEmailed = await runWithoutTenant(() =>
      repo.findDigestUsersUnscoped({ since, limit: 2, after: first.next }),
    );
    expect(afterEmailed).toEqual({ users: [], next: null });
  });

  it("leaves out read and already mailed notifications and those older than the window", async () => {
    const { w, add } = await seed();
    await add(w.admin.id, minutesAgo(10), { readAt: now });
    await add(w.admin.id, minutesAgo(10), { emailedAt: now });
    await add(w.member.id, minutesAgo(500));
    const repo = new PrismaNotificationRepo();

    const page = await runWithoutTenant(() =>
      repo.findDigestUsersUnscoped({ since: minutesAgo(120), limit: 10, after: null }),
    );

    expect(page.users).toEqual([]);
  });

  it("counts the mails of the last hour per member and kind", async () => {
    const { w, add } = await seed();
    await add(w.admin.id, minutesAgo(90), { emailedAt: minutesAgo(30), kind: "ruleAlert" });
    await add(w.admin.id, minutesAgo(90), { emailedAt: minutesAgo(20), kind: "ruleAlert" });
    await add(w.admin.id, minutesAgo(90), { emailedAt: minutesAgo(10), kind: "dueToday" });
    await add(w.admin.id, minutesAgo(200), { emailedAt: minutesAgo(90), kind: "ruleAlert" });
    await add(w.member.id, minutesAgo(90), { emailedAt: minutesAgo(5), kind: "ruleAlert" });
    await add(w.admin.id, minutesAgo(5));
    const repo = new PrismaNotificationRepo();

    const counts = await runWithoutTenant(() =>
      repo.countEmailedSinceUnscoped(w.companyId, [w.admin.id], minutesAgo(60)),
    );

    expect(counts.sort((left, right) => left.kind.localeCompare(right.kind))).toEqual([
      { userId: w.admin.id, kind: "dueToday", count: 1 },
      { userId: w.admin.id, kind: "ruleAlert", count: 2 },
    ]);
    expect(await runWithoutTenant(() => repo.countEmailedSinceUnscoped(w.companyId, [], minutesAgo(60)))).toEqual([]);
  });
});
