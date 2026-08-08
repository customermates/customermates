import { randomUUID } from "node:crypto";

import { describe, it, expect, afterAll, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    CLOUD_HOSTED: true,
    AGENT_CHAT_ENABLED: true,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const { PrismaAgentChatRepo } = await import("@/features/agent-chat/prisma-agent-chat.repository");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const companyIds: string[] = [];

afterAll(async () => {
  for (const companyId of companyIds) {
    await runWithoutTenant(() => prisma.agentUsageEvent.deleteMany({ where: { companyId } }));
    await runWithoutTenant(() => prisma.user.deleteMany({ where: { companyId } }));
    await runWithoutTenant(() => prisma.subscription.deleteMany({ where: { companyId } }));
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
  }
  await prisma.$disconnect();
});

async function seedActiveSeat(allowanceAnchor: Date) {
  const companyId = randomUUID();
  const userId = randomUUID();
  companyIds.push(companyId);

  await runWithoutTenant(() => prisma.company.create({ data: { id: companyId } }));
  await runWithoutTenant(() =>
    prisma.subscription.create({
      data: {
        companyId,
        status: "active",
        plan: "starter",
        agentCreditAnchorAt: allowanceAnchor,
      },
    }),
  );
  await runWithoutTenant(() =>
    prisma.user.create({
      data: {
        id: userId,
        companyId,
        email: `credit-${userId}@example.com`,
        firstName: "Credit",
        lastName: "Seat",
        status: "active",
        agentCreditActivatedAt: allowanceAnchor,
      },
    }),
  );

  return { companyId, userId };
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("agent credit ledger against a real database", { timeout: 120_000 }, () => {
  it("admits only as many concurrent reservations as the allowance permits", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);

    const repo = new PrismaAgentChatRepo();
    const reserve = (reservedCredits: number) =>
      runWithoutTenant(() =>
        repo.reserveUsageEventUnscoped({
          id: randomUUID(),
          companyId,
          userId,
          sessionId: randomUUID(),
          reservedCredits,
          planSnapshot: "starter",
          subscriptionStatusSnapshot: "active",
          allowanceCreditsSnapshot: 200,
          periodStart: anchor,
          periodEnd: anchor,
        }),
      );

    await reserve(197);

    const outcomes = await Promise.allSettled([reserve(1), reserve(1), reserve(1), reserve(1), reserve(1)]);
    const accepted = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected").length;

    expect(accepted).toBe(3);
    expect(rejected).toBe(2);

    const rows = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findMany({ where: { userId }, select: { reservedCredits: true, state: true } }),
    );
    const reservedTotal = rows.reduce((total, row) => total + row.reservedCredits, 0);

    expect(reservedTotal).toBe(200);
    expect(rows.every((row) => row.state === "reserved")).toBe(true);
  });

  it("never lets a reservation exceed the allowance even when issued alone", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    const repo = new PrismaAgentChatRepo();

    await expect(
      runWithoutTenant(() =>
        repo.reserveUsageEventUnscoped({
          id: randomUUID(),
          companyId,
          userId,
          sessionId: randomUUID(),
          reservedCredits: 201,
          planSnapshot: "starter",
          subscriptionStatusSnapshot: "active",
          allowanceCreditsSnapshot: 200,
          periodStart: anchor,
          periodEnd: anchor,
        }),
      ),
    ).rejects.toThrow(/exceeds the current allowance/);

    const rows = await runWithoutTenant(() => prisma.agentUsageEvent.findMany({ where: { userId } }));
    expect(rows).toHaveLength(0);
  });

  it("counts reserved credits against the period until they settle", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    const repo = new PrismaAgentChatRepo();
    const reservationId = randomUUID();

    await runWithoutTenant(() =>
      repo.reserveUsageEventUnscoped({
        id: reservationId,
        companyId,
        userId,
        sessionId: randomUUID(),
        reservedCredits: 8,
        planSnapshot: "starter",
        subscriptionStatusSnapshot: "active",
        allowanceCreditsSnapshot: 200,
        periodStart: anchor,
        periodEnd: anchor,
      }),
    );

    const reserved = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findUniqueOrThrow({ where: { id: reservationId } }),
    );
    const usage = await runWithoutTenant(() =>
      repo.getUserCreditUsageUnscoped(userId, reserved.periodStart, reserved.periodEnd),
    );

    expect(usage.usedCredits).toBe(8);
  });
});
