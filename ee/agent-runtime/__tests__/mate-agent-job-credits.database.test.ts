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

  it("extends the held credits round by round up to the ceiling of one run and settles against the extended amount", async () => {
    const { companyId, userId } = await seedActiveSeat();
    const mate = credits();
    const reserved = await mate.reserve({ jobId: randomUUID(), attempt: 1, companyId, userId });
    if (!reserved.ok) throw new Error("The credits were not reserved");
    const { reservationId, reservedMicrocents, ceilingMicrocents, budget } = reserved.reservation;
    const owner = { reservationId, companyId, userId };
    expect(ceilingMicrocents).toBe(10_000_000);
    expect(reservedMicrocents).toBeLessThan(ceilingMicrocents);

    expect(await mate.extend({ ...owner, requiredMicrocents: reservedMicrocents - 1, ceilingMicrocents })).toEqual({
      disposition: "extended",
      reservedMicrocents,
    });
    expect(await mate.extend({ ...owner, requiredMicrocents: 8_000_000, ceilingMicrocents })).toEqual({
      disposition: "extended",
      reservedMicrocents: 8_000_000,
    });
    expect((await eventOf(reservationId))?.reservedMicrocents).toBe(8_000_000n);
    expect(await mate.extend({ ...owner, requiredMicrocents: ceilingMicrocents + 1, ceilingMicrocents })).toEqual({
      disposition: "run_credit_limit",
      ceilingMicrocents,
    });
    expect((await eventOf(reservationId))?.reservedMicrocents).toBe(8_000_000n);

    const steps = [
      {
        tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        providerMetadata: undefined,
        unmeasuredMicrocents: 7_400_000,
      },
    ];
    const unextended = buildMateJobSettlement(steps, budget);
    expect(unextended.policyBreach).toBe(true);
    expect(await mate.settle({ ...owner, settlement: unextended })).toBe(false);
    const settlement = buildMateJobSettlement(steps, { ...budget, reservedMicrocents: 8_000_000 });
    expect(settlement).toMatchObject({ chargedMicrocents: 7_400_000, policyBreach: false });
    expect(await mate.settle({ ...owner, settlement })).toBe(true);
    expect(await eventOf(reservationId)).toMatchObject({ state: "settled", chargedMicrocents: 7_400_000n });
  });

  it("refuses an extension the member's allowance does not cover and one for a reservation that is not a job's", async () => {
    const { companyId, userId } = await seedActiveSeat();
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);
    const mate = new MateAgentJobCredits(usage);
    const reserved = await mate.reserve({ jobId: randomUUID(), attempt: 1, companyId, userId });
    if (!reserved.ok) throw new Error("The credits were not reserved");
    const { reservationId, ceilingMicrocents } = reserved.reservation;
    const held = await eventOf(reservationId);
    if (!held) throw new Error("The reservation is missing");
    await runWithoutTenant(() =>
      prisma.agentUsageEvent.create({
        data: {
          companyId,
          userId,
          state: "settled",
          model: "earlier-usage",
          costMicrocents: 93_000_000,
          chargedMicrocents: 93_000_000,
          reservedMicrocents: 93_000_000,
          planSnapshot: held.planSnapshot,
          subscriptionStatusSnapshot: held.subscriptionStatusSnapshot,
          allowanceMicrocentsSnapshot: held.allowanceMicrocentsSnapshot,
          periodStart: held.periodStart,
          periodEnd: held.periodEnd,
          settledAt: new Date(),
        },
      }),
    );

    expect(
      await mate.extend({ reservationId, companyId, userId, requiredMicrocents: 7_500_000, ceilingMicrocents }),
    ).toEqual({ disposition: "credit_limit" });
    expect((await eventOf(reservationId))?.reservedMicrocents).toBe(held.reservedMicrocents);

    const chat = await seedActiveSeat();
    const chatOwner = { reservationId: randomUUID(), companyId: chat.companyId, userId: chat.userId };
    const admission = await usage.prepareTurn(chat.userId, new Date(), { model: mate.model });
    if (!admission.reservation) throw new Error("The chat turn was not admitted");
    await usage.reserveUsage({ ...chatOwner, reservation: admission.reservation });
    expect(await mate.extend({ ...chatOwner, requiredMicrocents: 6_000_000, ceilingMicrocents })).toEqual({
      disposition: "turn_error",
    });
    expect(await mate.admitRound(chatOwner)).toBe(false);
    expect((await eventOf(chatOwner.reservationId))?.providerStartedAt).toBeNull();
  });

  it("marks the reservation when the first round starts and refuses a round of a reservation that is closed", async () => {
    const { companyId, userId } = await seedActiveSeat();
    const jobId = randomUUID();
    const mate = credits();
    const reserved = await mate.reserve({ jobId, attempt: 1, companyId, userId });
    if (!reserved.ok) throw new Error("The credits were not reserved");
    const owner = { reservationId: reserved.reservation.reservationId, companyId, userId };
    expect((await eventOf(owner.reservationId))?.providerStartedAt).toBeNull();

    const startedAt = new Date("2026-11-17T10:00:00.000Z");
    expect(await mate.admitRound({ ...owner, now: startedAt })).toBe(true);
    expect((await eventOf(owner.reservationId))?.providerStartedAt).toEqual(startedAt);
    expect(await mate.admitRound({ ...owner, now: new Date("2026-11-17T10:01:00.000Z") })).toBe(true);
    expect((await eventOf(owner.reservationId))?.providerStartedAt).toEqual(startedAt);

    await mate.release({ jobId, attempt: 1, companyId, userId });
    expect(await mate.admitRound(owner)).toBe(false);
  });

  it("keeps the whole reservation of an attempt that was interrupted after its provider call started", async () => {
    const { companyId, userId } = await seedActiveSeat();
    const jobId = randomUUID();
    const mate = credits();
    const reserved = await mate.reserve({ jobId, attempt: 1, companyId, userId });
    if (!reserved.ok) throw new Error("The credits were not reserved");
    const { reservationId, ceilingMicrocents, budget } = reserved.reservation;
    const owner = { reservationId, companyId, userId };
    await mate.admitRound(owner);
    await mate.extend({ ...owner, requiredMicrocents: 6_200_000, ceilingMicrocents });

    expect(await mate.settleInterrupted({ jobId, attempt: 1, companyId, userId })).toBe("retained");

    expect(await eventOf(reservationId)).toMatchObject({
      state: "retained",
      model: mate.model.modelId,
      costSource: "estimated",
      reservedMicrocents: 6_200_000n,
      chargedMicrocents: 6_200_000n,
    });
    expect(await mate.settleInterrupted({ jobId, attempt: 1, companyId, userId })).toBe("none");
    const late = buildMateJobSettlement([], { ...budget, reservedMicrocents: 6_200_000 });
    expect(await mate.settle({ ...owner, settlement: late })).toBe(false);
    await mate.release({ jobId, attempt: 1, companyId, userId });
    expect((await eventOf(reservationId))?.state).toBe("retained");
  });

  it("gives the credits back for an attempt that was interrupted before any provider call", async () => {
    const { companyId, userId } = await seedActiveSeat();
    const jobId = randomUUID();
    const mate = credits();
    const reserved = await mate.reserve({ jobId, attempt: 2, companyId, userId });
    if (!reserved.ok) throw new Error("The credits were not reserved");

    expect(await mate.settleInterrupted({ jobId, attempt: 2, companyId, userId })).toBe("released");

    expect(await eventOf(reserved.reservation.reservationId)).toMatchObject({
      state: "released",
      chargedMicrocents: 0n,
    });
    expect(await mate.settleInterrupted({ jobId, attempt: 1, companyId, userId })).toBe("none");
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

  it("closes the reservations that a job left behind and leaves the one of a job that still runs", async () => {
    const { companyId, userId } = await seedActiveSeat();
    const mate = credits();
    const now = new Date();
    const reservedBefore = new Date(now.getTime() - 12 * 60_000);
    const long = new Date(now.getTime() - 30 * 60_000);
    const job = async (status: "running" | "succeeded" | "timedOut", attempts = 1) => {
      const id = randomUUID();
      await runWithoutTenant(() =>
        prisma.agentJob.create({
          data: {
            id,
            companyId,
            ownerUserId: userId,
            runtime: "mate",
            status,
            sourceKind: "automation",
            prompt: "Do the thing",
            attempts,
          },
        }),
      );
      return id;
    };
    const hold = async (jobId: string, attempt = 1) => {
      const reserved = await mate.reserve({ jobId, attempt, companyId, userId });
      if (!reserved.ok) throw new Error("The credits were not reserved");
      return reserved.reservation.reservationId;
    };
    const backdate = (id: string) =>
      runWithoutTenant(() => prisma.agentUsageEvent.update({ where: { id }, data: { createdAt: long } }));

    const finished = await hold(await job("succeeded"));
    const timedOutAfterStart = await hold(await job("timedOut"));
    await mate.admitRound({ reservationId: timedOutAfterStart, companyId, userId });
    const stillRunning = await hold(await job("running"));
    const runningTooLong = await hold(await job("running"));
    await backdate(runningTooLong);
    const earlierAttempt = await hold(await job("running", 2), 1);
    const withoutJob = await hold(randomUUID());
    const chat = { reservationId: randomUUID(), companyId, userId };
    const admission = await new AgentUsageService(
      new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()),
    ).prepareTurn(userId, now, { model: mate.model });
    if (!admission.reservation) throw new Error("The chat turn was not admitted");
    await new AgentUsageService(new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies())).reserveUsage({
      ...chat,
      reservation: admission.reservation,
    });
    await backdate(chat.reservationId);

    expect(await mate.closeAbandoned({ reservedBefore, now, limit: 1 })).toBe(1);
    await mate.closeAbandoned({ reservedBefore, now, limit: 500 });

    expect(await eventOf(finished)).toMatchObject({ state: "released", chargedMicrocents: 0n, settledAt: now });
    const retained = await eventOf(timedOutAfterStart);
    expect(retained).toMatchObject({ state: "retained", model: mate.model.modelId });
    expect(retained?.chargedMicrocents).toBe(retained?.reservedMicrocents);
    expect((await eventOf(stillRunning))?.state).toBe("reserved");
    expect((await eventOf(runningTooLong))?.state).toBe("released");
    expect((await eventOf(earlierAttempt))?.state).toBe("released");
    expect((await eventOf(withoutJob))?.state).toBe("released");
    expect((await eventOf(chat.reservationId))?.state).toBe("reserved");
    expect(await mate.closeAbandoned({ reservedBefore, now, limit: 500 })).toBe(0);
  });
});
