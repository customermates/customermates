import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: { APP_MODE: "cloud", DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

const { prisma } = await import("@/prisma/db");
const { PermissionService } = await import("@/core/base/permission.service");
const { PrismaBillingUsageRepo } = await import("@/features/billing-usage/prisma-billing-usage.repository");
const { PrismaUserRepo } = await import("../prisma-user.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

async function member(lastActiveAt: Date | null) {
  const companyId = randomUUID();
  const userId = randomUUID();
  companyIds.push(companyId);
  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    await prisma.user.create({
      data: {
        id: userId,
        companyId,
        email: `last-active-${randomUUID()}@example.invalid`,
        firstName: "Last",
        lastName: "Active",
        status: "active",
        lastActiveAt,
      },
    });
  });
  return userId;
}

async function row(userId: string) {
  return runWithoutTenant(() =>
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, companyId: true, updatedAt: true, lastActiveAt: true },
    }),
  );
}

async function lastActive(userId: string) {
  return (await row(userId)).lastActiveAt;
}

afterAll(async () => {
  await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companyIds } } }));
  await prisma.$disconnect();
});

describeDatabase("recording a member's last activity", () => {
  const repo = new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo());

  it("moves a stale or missing last activity to now and leaves a recent one alone", async () => {
    const staleBefore = new Date(Date.now() - 15 * 60_000);
    const stale = await member(new Date(Date.now() - 3 * 86_400_000));
    const missing = await member(null);
    const recentAt = new Date(Date.now() - 60_000);
    const recent = await member(recentAt);

    const before = await row(stale);
    for (const userId of [stale, missing, recent]) await repo.touchLastActiveUnscoped(await row(userId), staleBefore);

    expect((await lastActive(stale))?.getTime()).toBeGreaterThan(staleBefore.getTime());
    expect((await row(stale)).updatedAt).toEqual(before.updatedAt);
    expect((await lastActive(missing))?.getTime()).toBeGreaterThan(staleBefore.getTime());
    expect(await lastActive(recent)).toEqual(recentAt);
  });

  it("leaves a member alone whose profile changed since it was loaded", async () => {
    const userId = await member(null);
    const loaded = await row(userId);
    await runWithoutTenant(() => prisma.user.update({ where: { id: userId }, data: { firstName: "Changed" } }));

    await repo.touchLastActiveUnscoped(loaded, new Date());

    expect(await lastActive(userId)).toBeNull();
  });
});
