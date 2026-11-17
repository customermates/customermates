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

describeDatabase("the notification email footer data", { timeout: 60_000 }, () => {
  async function seed() {
    const w = await createRestRouteWorkspace();
    cleanups.push(w.cleanup);
    return w;
  }

  it("sets one kind to off for a member without a session and leaves the other kinds alone", async () => {
    const w = await seed();
    const repo = new PrismaNotificationRepo();
    await runWithoutTenant(() => repo.saveEmailModeUnscoped(w.companyId, w.member.id, "replyReceived", "instant"));

    await runWithoutTenant(() => repo.saveEmailModeUnscoped(w.companyId, w.member.id, "ruleAlert", "off"));
    await runWithoutTenant(() => repo.saveEmailModeUnscoped(w.companyId, w.member.id, "ruleAlert", "off"));

    const stored = await runWithoutTenant(() => repo.findPreferencesUnscoped(w.companyId, [w.member.id]));
    expect([...(stored.get(w.member.id) ?? [])].sort()).toEqual([
      ["replyReceived", "instant"],
      ["ruleAlert", "off"],
    ]);
    const rows = await runWithoutTenant(() =>
      prisma.notificationPreference.count({ where: { companyId: w.companyId, userId: w.member.id } }),
    );
    expect(rows).toBe(2);
  });

  it("changes only the member the link was signed for", async () => {
    const w = await seed();
    const repo = new PrismaNotificationRepo();

    await runWithoutTenant(() => repo.saveEmailModeUnscoped(w.companyId, w.member.id, "dueToday", "off"));

    const stored = await runWithoutTenant(() => repo.findPreferencesUnscoped(w.companyId, [w.member.id, w.admin.id]));
    expect(stored.get(w.member.id)?.get("dueToday")).toBe("off");
    expect(stored.has(w.admin.id)).toBe(false);
  });

  it("names the automation rule behind a notification and nothing for one that has none", async () => {
    const w = await seed();
    const rule = await runWithoutTenant(() =>
      prisma.automationRule.create({
        data: {
          companyId: w.companyId,
          name: "Follow up after 3 days",
          triggerKind: "recordCreated",
          trigger: {},
          effects: [],
        },
      }),
    );
    const fromRule = await runWithoutTenant(() =>
      prisma.notification.create({
        data: {
          companyId: w.companyId,
          userId: w.member.id,
          kind: "ruleAlert",
          title: "Deal went quiet",
          sourceRuleId: rule.id,
        },
      }),
    );
    const plain = await runWithoutTenant(() =>
      prisma.notification.create({
        data: { companyId: w.companyId, userId: w.member.id, kind: "dueToday", title: "Call back" },
      }),
    );
    const repo = new PrismaNotificationRepo();

    const found = await runWithoutTenant(() => repo.findNotificationsUnscoped(w.companyId, [fromRule.id, plain.id]));

    expect(found.map(({ id, sourceRuleId, sourceRuleName }) => ({ id, sourceRuleId, sourceRuleName }))).toEqual(
      expect.arrayContaining([
        { id: fromRule.id, sourceRuleId: rule.id, sourceRuleName: "Follow up after 3 days" },
        { id: plain.id, sourceRuleId: null, sourceRuleName: null },
      ]),
    );
  });

  it("reads the rule name for the daily digest as well, and nothing once the rule is gone", async () => {
    const w = await seed();
    const rule = await runWithoutTenant(() =>
      prisma.automationRule.create({
        data: {
          companyId: w.companyId,
          name: "Stale deals",
          triggerKind: "recordCreated",
          trigger: {},
          effects: [],
        },
      }),
    );
    const alert = await runWithoutTenant(() =>
      prisma.notification.create({
        data: {
          companyId: w.companyId,
          userId: w.member.id,
          kind: "ruleAlert",
          title: "Stale",
          sourceRuleId: rule.id,
        },
      }),
    );
    const repo = new PrismaNotificationRepo();
    const since = new Date(Date.now() - 60 * 60 * 1000);

    const before = await runWithoutTenant(() => repo.findUnemailedUnscoped(w.companyId, w.member.id, since));
    await runWithoutTenant(() => prisma.automationRule.delete({ where: { id: rule.id } }));
    const after = await runWithoutTenant(() => repo.findUnemailedUnscoped(w.companyId, w.member.id, since));

    expect(before.find((item) => item.id === alert.id)?.sourceRuleName).toBe("Stale deals");
    expect(after.find((item) => item.id === alert.id)?.sourceRuleName).toBeNull();
  });
});
