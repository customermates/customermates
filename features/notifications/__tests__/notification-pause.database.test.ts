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

const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { createRestRouteWorkspace } = await import("@/tests/helpers/rest-route-workspace");
const { PrismaNotificationPauseRepo } = await import("../prisma-notification-pause.repository");
const { PrismaNotificationRepo } = await import("../prisma-notification.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

describeDatabase("the notification pause store", { timeout: 60_000 }, () => {
  it("keeps one pause per member of a workspace, replaces it on save and reads it without a tenant", async () => {
    const w = await createRestRouteWorkspace();
    cleanups.push(w.cleanup);
    const repo = new PrismaNotificationPauseRepo();
    const first = new Date("2026-12-01T00:00:00.000Z");
    const later = new Date("2026-12-24T00:00:00.000Z");

    await runWithTenant(w.admin, () => repo.save(first));
    await runWithTenant(w.admin, () => repo.save(later));
    expect(await runWithTenant(w.admin, () => repo.find())).toEqual(later);
    expect(await runWithTenant(w.member, () => repo.find())).toBeNull();

    const unscoped = await runWithoutTenant(() => repo.findUnscoped(w.companyId, [w.admin.id, w.member.id]));
    expect([...unscoped]).toEqual([[w.admin.id, later]]);
    expect(await runWithoutTenant(() => repo.findUnscoped(w.companyId, []))).toEqual(new Map());

    await runWithTenant(w.member, () => repo.clear());
    expect(await runWithTenant(w.admin, () => repo.find())).toEqual(later);
    await runWithTenant(w.admin, () => repo.clear());
    expect(await runWithTenant(w.admin, () => repo.find())).toBeNull();
  });

  it("saves and replaces a member's own email modes under the tenant guard", async () => {
    const w = await createRestRouteWorkspace();
    cleanups.push(w.cleanup);
    const repo = new PrismaNotificationRepo();

    await runWithTenant(w.admin, () => repo.savePreferences([{ kind: "dueToday", emailMode: "off" }]));
    await runWithTenant(w.admin, () => repo.savePreferences([{ kind: "dueToday", emailMode: "instant" }]));
    await runWithTenant(w.member, () => repo.savePreferences([{ kind: "ruleAlert", emailMode: "digest" }]));

    expect(await runWithTenant(w.admin, () => repo.findPreferences())).toEqual([
      { kind: "dueToday", emailMode: "instant" },
    ]);
    expect(await runWithTenant(w.member, () => repo.findPreferences())).toEqual([
      { kind: "ruleAlert", emailMode: "digest" },
    ]);
  });
});
