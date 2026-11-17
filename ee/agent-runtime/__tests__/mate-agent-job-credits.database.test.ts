import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    CLOUD_HOSTED: true,
    AGENT_CHAT_DISABLED: false,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BASE_URL: "http://localhost:4000",
    AUTH_ALLOWED_HOSTS: ["localhost:4000"],
    AI_GATEWAY_API_KEY: undefined,
  },
}));
vi.mock("@/core/di", () => ({ getUserService: () => ({}) }));
vi.mock("@/core/validation/zod-error-map-server", () => ({
  getZodParseContext: vi.fn().mockResolvedValue(undefined),
}));

const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");
const { prismaAgentChatRepoDependencies } = await import("@/tests/helpers/prisma-agent-chat-repo");
const { AgentUsageService } = await import("@/ee/agent-chat/agent-usage.service");
const { MateAgentJobCredits } = await import("../mate-agent-job-credits");
const { buildMateJobSettlement } = await import("../mate-agent-job-settlement");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant, runWithTenant } = await import("@/core/decorators/tenant-context");
const { createMockUser } = await import("@/tests/helpers/mock-user");

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

async function seedActiveSeat() {
  const companyId = randomUUID();
  const userId = randomUUID();
  const anchor = new Date(Date.now() - 24 * 60 * 60 * 1000);
  companyIds.push(companyId);
  await runWithoutTenant(() => prisma.company.create({ data: { id: companyId } }));
  await runWithoutTenant(() =>
    prisma.subscription.create({
      data: { companyId, status: "active", plan: "starter", agentCreditAnchorAt: anchor },
    }),
  );
  await runWithoutTenant(() =>
    prisma.user.create({
      data: {
        id: userId,
        companyId,
        email: `agent-job-${userId}@example.com`,
        firstName: "Agent",
        lastName: "Job",
        status: "active",
        agentCreditActivatedAt: anchor,
      },
    }),
  );
  return { companyId, userId };
}

async function eventOf(id: string) {
  return runWithoutTenant(() => prisma.agentUsageEvent.findUnique({ where: { id } }));
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("hosted credits of a Mate agent job", () => {
  const credits = () =>
    new MateAgentJobCredits(new AgentUsageService(new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies())));

  it("holds credits for the attempt, settles what the rounds cost and ignores a second settle", async () => {
    const { companyId, userId } = await seedActiveSeat();
    const jobId = randomUUID();
    const mate = credits();

    const reserved = await mate.reserve({ jobId, attempt: 1, companyId, userId });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.reservation.reservationId).toBe(`agent-job:${jobId}:1`);
    expect(await eventOf(reserved.reservation.reservationId)).toMatchObject({
      state: "reserved",
      companyId,
      userId,
      purpose: "turn",
      turnRequestId: null,
      sessionId: `agent-job:${jobId}:1`,
    });

    const settlement = buildMateJobSettlement(
      [
        {
          tokens: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
          providerMetadata: undefined,
        },
      ],
      reserved.reservation.budget,
    );
    const settle = { reservationId: reserved.reservation.reservationId, companyId, userId, settlement };
    expect(await mate.settle(settle)).toBe(true);
    expect(await eventOf(reserved.reservation.reservationId)).toMatchObject({
      state: "settled",
      inputTokens: 1000,
      outputTokens: 100,
      chargedMicrocents: BigInt(settlement.chargedMicrocents),
    });
    expect(await mate.settle(settle)).toBe(false);
  });

  it("gives the credits back when the attempt is released and refuses to settle it afterwards", async () => {
    const { companyId, userId } = await seedActiveSeat();
    const jobId = randomUUID();
    const mate = credits();
    const reserved = await mate.reserve({ jobId, attempt: 2, companyId, userId });
    if (!reserved.ok) throw new Error("The credits were not reserved");

    await mate.release({ jobId, attempt: 2, companyId, userId });

    expect(await eventOf(reserved.reservation.reservationId)).toMatchObject({
      state: "released",
      chargedMicrocents: 0n,
    });
    const settlement = buildMateJobSettlement([], reserved.reservation.budget);
    expect(
      await mate.settle({ reservationId: reserved.reservation.reservationId, companyId, userId, settlement }),
    ).toBe(false);
  });

  it("keeps the credits of a running job when the owner's expired chat lease is cleaned up", async () => {
    const { companyId, userId } = await seedActiveSeat();
    const owner = createMockUser({ id: userId, companyId, email: `agent-job-${userId}@example.com` });
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);
    const mate = new MateAgentJobCredits(usage);
    const reserved = await mate.reserve({ jobId: randomUUID(), attempt: 1, companyId, userId });
    if (!reserved.ok) throw new Error("The credits were not reserved");

    const orphanedChatReservation = randomUUID();
    const admission = await usage.prepareTurn(userId, new Date(), { model: mate.model });
    if (!admission.reservation) throw new Error("The chat turn was not admitted");
    await usage.reserveUsage({
      reservationId: orphanedChatReservation,
      companyId,
      userId,
      reservation: admission.reservation,
    });
    const conversationId = randomUUID();
    await runWithoutTenant(() => prisma.agentConversation.create({ data: { id: conversationId, companyId, userId } }));
    await runWithoutTenant(() =>
      prisma.agentRunLease.create({
        data: { conversationId, companyId, userId, runId: randomUUID(), expiresAt: new Date(Date.now() - 60_000) },
      }),
    );

    await runWithTenant(owner, () =>
      repo.normalizeExpiredAgentRunLease(new Date(), reserved.reservation.budget.modelSpec),
    );

    expect(await runWithoutTenant(() => prisma.agentRunLease.count({ where: { userId } }))).toBe(0);
    expect((await eventOf(orphanedChatReservation))?.state).toBe("released");
    expect((await eventOf(reserved.reservation.reservationId))?.state).toBe("reserved");
    const settlement = buildMateJobSettlement(
      [
        {
          tokens: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
          providerMetadata: undefined,
        },
      ],
      reserved.reservation.budget,
    );
    expect(
      await mate.settle({ reservationId: reserved.reservation.reservationId, companyId, userId, settlement }),
    ).toBe(true);
  });

  it("does not settle another member's reservation", async () => {
    const mine = await seedActiveSeat();
    const theirs = await seedActiveSeat();
    const jobId = randomUUID();
    const mate = credits();
    const reserved = await mate.reserve({ jobId, attempt: 1, companyId: mine.companyId, userId: mine.userId });
    if (!reserved.ok) throw new Error("The credits were not reserved");
    const settlement = buildMateJobSettlement([], reserved.reservation.budget);

    expect(
      await mate.settle({
        reservationId: reserved.reservation.reservationId,
        companyId: theirs.companyId,
        userId: theirs.userId,
        settlement,
      }),
    ).toBe(false);
    expect((await eventOf(reserved.reservation.reservationId))?.state).toBe("reserved");
  });
});
