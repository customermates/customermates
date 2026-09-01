import { randomUUID } from "node:crypto";

import { describe, it, expect, afterAll, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import type { TenantUser } from "@/features/user/user.schema";

const authState = vi.hoisted(() => ({ user: null as TenantUser | null }));

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    CLOUD_HOSTED: true,
    AGENT_CHAT_DISABLED: false,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BASE_URL: "http://localhost:4000",
    AI_GATEWAY_API_KEY: undefined,
  },
}));
vi.mock("@/core/di", () => ({
  getUserService: () => ({
    getActiveUserOrThrow: () => {
      if (!authState.user) throw new Error("Test user is not configured.");
      return Promise.resolve(authState.user);
    },
  }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => ({
  getZodParseContext: vi.fn().mockResolvedValue(undefined),
}));

const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");
const { AGENT_MAX_CONCURRENT_RUNS_PER_USER } = await import("@/ee/agent-chat/agent-run-limits");
const { AGENT_RUN_LEASE_MS } = await import("@/ee/agent-chat/agent-turn-request");
const { AgentUsageService } = await import("@/ee/agent-chat/agent-usage.service");
const { SendAgentMessageInteractor } = await import("@/ee/agent-chat/send-agent-message.interactor");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant, runWithTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { getTransactionClient } = await import("@/core/decorators/transaction-context");
type PrismaAgentChatRepoInstance = InstanceType<typeof PrismaAgentChatRepo>;

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

const backgroundTasks = () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchTracked: vi.fn().mockResolvedValue("wrun_test"),
  resume: vi.fn().mockResolvedValue(true),
});

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const entitlements = { require: vi.fn().mockResolvedValue(null) };

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
      prisma.agentUsageEvent.findMany({
        where: { userId },
        select: { reservedCredits: true, state: true },
      }),
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
      prisma.agentUsageEvent.findUniqueOrThrow({
        where: { id: reservationId },
      }),
    );
    const usage = await runWithoutTenant(() =>
      repo.getUserCreditUsageUnscoped(reserved.companyId, userId, reserved.periodStart, reserved.periodEnd),
    );

    expect(usage.usedCredits).toBe(8);
  });

  it("binds the reservation to the turn, so it survives the run id changing under it", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `rekey-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Start a chat",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId, runId, conversationId } = admitted.data;

    const reservation = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findFirstOrThrow({
        where: { userId, state: "reserved" },
      }),
    );
    expect(reservation.turnRequestId).toBe(turnRequestId);
    expect(reservation.id).not.toBe(runId);

    const movedRunId = randomUUID();
    await runWithoutTenant(async () => {
      await prisma.agentTurnRequest.update({
        where: { id: turnRequestId },
        data: { runId: movedRunId },
      });
      await prisma.agentRunLease.updateMany({
        where: { userId },
        data: { runId: movedRunId },
      });
    });

    await runWithoutTenant(() =>
      repo.markAgentTurnProviderStartedUnscoped({
        turnRequestId,
        conversationId,
        companyId,
        userId,
        runId: movedRunId,
      }),
    );

    const started = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findUniqueOrThrow({
        where: { id: reservation.id },
      }),
    );
    expect(started.providerStartedAt).not.toBeNull();
  });

  it("keeps a heartbeating turn alive against the sweeper that would otherwise settle it", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `heartbeat-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Start a long chat",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId, runId } = admitted.data;

    const staleAt = new Date(Date.now() - 60_000);
    await runWithoutTenant(() =>
      prisma.agentRunLease.updateMany({
        where: { userId },
        data: { expiresAt: staleAt },
      }),
    );

    const alive = await runWithoutTenant(() =>
      repo.heartbeatAgentRunUnscoped({
        turnRequestId,
        companyId,
        userId,
        runId,
      }),
    );
    expect(alive).toBe(true);

    const sweeper = authState.user;
    if (!sweeper) throw new Error("Expected a tenant user.");
    await runWithTenant(sweeper, () => repo.normalizeExpiredAgentRunLease(new Date(), "openai/gpt-5.6-luna"));

    const [turn, lease, event] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentTurnRequest.findUniqueOrThrow({
          where: { id: turnRequestId },
        }),
        prisma.agentRunLease.findFirst({ where: { userId } }),
        prisma.agentUsageEvent.findFirstOrThrow({ where: { turnRequestId } }),
      ]),
    );
    expect(turn.status).toBe("running");
    expect(turn.heartbeatAt).not.toBeNull();
    expect(lease).not.toBeNull();
    expect(event.state).toBe("reserved");
  });

  it("holds the lease for a whole approval window, so a sweep past the ordinary horizon leaves the turn alone", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `suspended-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Delete something that needs approval",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId, runId } = admitted.data;

    const approvalDeadline = new Date(Date.now() + 30 * 60_000);
    const held = await runWithoutTenant(() =>
      repo.extendAgentRunLeaseForSuspensionUnscoped({
        companyId,
        userId,
        runId,
        until: approvalDeadline,
      }),
    );
    expect(held).toBe(true);

    const sweeper = authState.user;
    if (!sweeper) throw new Error("Expected a tenant user.");
    const pastTheOrdinaryLease = new Date(Date.now() + AGENT_RUN_LEASE_MS * 2);
    await runWithTenant(sweeper, () => repo.normalizeExpiredAgentRunLease(pastTheOrdinaryLease, "openai/gpt-5.6-luna"));

    const [turn, lease, event] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentTurnRequest.findUniqueOrThrow({
          where: { id: turnRequestId },
        }),
        prisma.agentRunLease.findFirst({ where: { userId } }),
        prisma.agentUsageEvent.findFirstOrThrow({ where: { turnRequestId } }),
      ]),
    );
    expect(turn.status).toBe("running");
    expect(turn.terminalCode).toBeNull();
    expect(lease?.expiresAt.getTime()).toBeGreaterThan(approvalDeadline.getTime());
    expect(event.state).toBe("reserved");

    const beat = await runWithoutTenant(() =>
      repo.heartbeatAgentRunUnscoped({
        turnRequestId,
        companyId,
        userId,
        runId,
      }),
    );
    expect(beat).toBe(true);
    const resumed = await runWithoutTenant(() => prisma.agentRunLease.findFirstOrThrow({ where: { userId } }));
    expect(resumed.expiresAt.getTime()).toBeLessThan(approvalDeadline.getTime());
  });

  it("settles a suspended turn once even its extended lease has genuinely expired", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `abandoned-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Delete something and then die",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId, runId } = admitted.data;

    const lapsed = new Date(Date.now() - 60 * 60_000);
    await runWithoutTenant(() =>
      repo.extendAgentRunLeaseForSuspensionUnscoped({
        companyId,
        userId,
        runId,
        until: lapsed,
      }),
    );

    const sweeper = authState.user;
    if (!sweeper) throw new Error("Expected a tenant user.");
    await runWithTenant(sweeper, () => repo.normalizeExpiredAgentRunLease(new Date(), "openai/gpt-5.6-luna"));

    const [turn, lease] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentTurnRequest.findUniqueOrThrow({
          where: { id: turnRequestId },
        }),
        prisma.agentRunLease.findFirst({ where: { userId } }),
      ]),
    );
    expect(turn.status).toBe("failed");
    expect(turn.terminalAt).not.toBeNull();
    expect(lease).toBeNull();
  });

  it("retains the full committed exposure when a provider-started turn expires without spend evidence", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `uncertain-${userId}@example.invalid`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Start provider work and lose its receipt",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId, conversationId, runId } = admitted.data;

    await runWithoutTenant(() =>
      repo.markAgentTurnProviderStartedUnscoped({
        turnRequestId,
        conversationId,
        companyId,
        userId,
        runId,
      }),
    );
    const reserved = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findFirstOrThrow({
        where: { turnRequestId, state: "reserved" },
      }),
    );
    await runWithoutTenant(() =>
      prisma.agentRunLease.updateMany({
        where: { companyId, userId, runId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      }),
    );

    const sweeper = authState.user;
    if (!sweeper) throw new Error("Expected a tenant user.");
    await runWithTenant(sweeper, () => repo.normalizeExpiredAgentRunLease(new Date(), "openai/gpt-5.6-luna"));

    const [turn, lease, retained, committedUsage] = await runWithoutTenant(async () => {
      const event = await prisma.agentUsageEvent.findUniqueOrThrow({
        where: { id: reserved.id },
      });
      return Promise.all([
        prisma.agentTurnRequest.findUniqueOrThrow({
          where: { id: turnRequestId },
        }),
        prisma.agentRunLease.findFirst({
          where: { companyId, userId, runId },
        }),
        Promise.resolve(event),
        repo.getUserCreditUsageUnscoped(companyId, userId, event.periodStart, event.periodEnd),
      ]);
    });

    expect(turn.status).toBe("uncertain");
    expect(lease).toBeNull();
    expect(retained).toMatchObject({
      state: "retained",
      costMicrocents: 0n,
      costSource: "estimated",
      reservedCredits: reserved.reservedCredits,
      chargedCredits: reserved.reservedCredits,
    });
    expect(committedUsage).toEqual({
      usedCredits: reserved.reservedCredits,
      recentTurnCredits: reserved.reservedCredits,
    });
  });

  it("refuses to heartbeat a run whose lease another writer already reclaimed", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `reclaimed-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Start a chat",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId, runId } = admitted.data;

    await runWithoutTenant(() => prisma.agentRunLease.deleteMany({ where: { userId } }));

    await expect(
      runWithoutTenant(() =>
        repo.heartbeatAgentRunUnscoped({
          turnRequestId,
          companyId,
          userId,
          runId,
        }),
      ),
    ).resolves.toBe(false);
  });

  it("keeps one row per round when the same round is recorded twice, as a replay would", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `rounds-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Start a chat",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId, runId } = admitted.data;

    const round = {
      turnRequestId,
      companyId,
      runId,
      roundIndex: 0,
      finishReason: "tool-calls",
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 4,
      costMicrocents: 4_400,
      modelSpec: "openai/gpt-5.6-luna",
      servingProvider: "openai",
    };

    await runWithoutTenant(() =>
      repo.recordAgentRunRoundUnscoped({
        ...round,
        parts: [{ role: "assistant" }],
      }),
    );
    await runWithoutTenant(() =>
      repo.recordAgentRunRoundUnscoped({
        ...round,
        costMicrocents: 5_500,
        parts: [{ role: "assistant" }],
      }),
    );
    await runWithoutTenant(() =>
      repo.recordAgentRunRoundUnscoped({
        ...round,
        roundIndex: 1,
        parts: [{ role: "assistant" }],
      }),
    );

    const rounds = await runWithoutTenant(() =>
      prisma.agentRunRound.findMany({
        where: { turnRequestId },
        orderBy: { roundIndex: "asc" },
      }),
    );
    expect(rounds).toHaveLength(2);
    expect(rounds[0].costMicrocents).toBe(5_500n);
    expect(rounds[0].reasoningTokens).toBe(4);
    expect(rounds[1].roundIndex).toBe(1);
  });

  it("takes a conversation's rounds with it on delete while its billing survives", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `cascade-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Start a chat",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId, runId, conversationId } = admitted.data;

    await runWithoutTenant(() =>
      repo.recordAgentRunRoundUnscoped({
        turnRequestId,
        companyId,
        runId,
        roundIndex: 0,
        parts: [{ role: "assistant" }],
        finishReason: "stop",
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        costMicrocents: 1,
        modelSpec: "openai/gpt-5.6-luna",
        servingProvider: "openai",
      }),
    );

    await runWithoutTenant(() => prisma.agentConversation.delete({ where: { id: conversationId } }));

    const [rounds, events] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentRunRound.count({ where: { turnRequestId } }),
        prisma.agentUsageEvent.count({ where: { userId } }),
      ]),
    );
    expect(rounds).toBe(0);
    expect(events).toBe(1);
  });

  it("commits one mutation and one receipt when the same tool call is executed twice", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `receipt-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Start a chat",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId } = admitted.data;
    const toolCallId = randomUUID();

    const exactlyOnce = async (mutate: () => Promise<unknown>) => {
      const receipt = await repo.claimAgentToolReceiptUnscoped({
        turnRequestId,
        companyId,
        toolCallId,
        toolName: "create_contacts",
      });
      if (receipt.state === "settled") return receipt.resultJson;

      return runInTransaction(async () => {
        const result = await mutate();
        await repo.settleAgentToolReceiptUnscoped({
          turnRequestId,
          companyId,
          toolCallId,
          resultJson: result as never,
        });
        return result;
      });
    };

    const mutate = async () => {
      const client = getTransactionClient<typeof prisma>() ?? prisma;
      const created = await client.agentConversation.create({
        data: { companyId, userId, title: "created by tool" },
        select: { id: true },
      });
      return { ok: true, result: created.id };
    };

    const first = await runWithoutTenant(() => exactlyOnce(mutate));
    const second = await runWithoutTenant(() => exactlyOnce(mutate));

    expect(second).toEqual(first);
    const [created, receipts] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentConversation.count({
          where: { companyId, title: "created by tool" },
        }),
        prisma.agentToolReceipt.findMany({ where: { turnRequestId } }),
      ]),
    );
    expect(created).toBe(1);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].state).toBe("settled");
  });

  it("leaves a receipt claimed and unsettled exactly when the mutation did not commit", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `rollback-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Start a chat",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId } = admitted.data;
    const toolCallId = randomUUID();

    await runWithoutTenant(() =>
      repo.claimAgentToolReceiptUnscoped({
        turnRequestId,
        companyId,
        toolCallId,
        toolName: "create_contacts",
      }),
    );

    await expect(
      runWithoutTenant(() =>
        runInTransaction(async () => {
          const client = getTransactionClient<typeof prisma>() ?? prisma;
          await client.agentConversation.create({
            data: { companyId, userId, title: "rolled back by tool" },
            select: { id: true },
          });
          throw new Error("mutation failed after writing");
        }),
      ),
    ).rejects.toThrow("mutation failed after writing");

    const [created, receipt] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentConversation.count({
          where: { companyId, title: "rolled back by tool" },
        }),
        prisma.agentToolReceipt.findFirstOrThrow({
          where: { turnRequestId, toolCallId },
        }),
      ]),
    );
    expect(created).toBe(0);
    expect(receipt.state).toBe("claimed");
    expect(receipt.settledAt).toBeNull();
  });

  it("rolls back a lease when phase-one credit reservation fails", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `phase-one-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);
    const failure = new Error("forced reservation failure");
    vi.spyOn(usage, "reserveUsage").mockRejectedValue(failure);
    vi.spyOn(repo, "releasePreProviderAdmissionOrThrowUnscoped").mockResolvedValue({ disposition: "released" });

    await expect(
      new SendAgentMessageInteractor(repo, usage, entitlements as never, backgroundTasks() as never).invoke({
        clientRequestId: randomUUID(),
        text: "Start a chat",
        retry: false,
      }),
    ).rejects.toBe(failure);

    const [lease, events, conversations, turns] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentRunLease.findFirst({ where: { userId } }),
        prisma.agentUsageEvent.findMany({ where: { userId } }),
        prisma.agentConversation.count({ where: { userId } }),
        prisma.agentTurnRequest.count({ where: { userId } }),
      ]),
    );
    expect(lease).toBeNull();
    expect(events).toHaveLength(0);
    expect(conversations).toBe(0);
    expect(turns).toBe(0);
  });

  it("commits only one lease and reservation for concurrent admissions into one conversation", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `concurrent-${userId}@example.com`,
    });
    const conversationId = randomUUID();
    await runWithoutTenant(() =>
      prisma.agentConversation.create({
        data: { id: conversationId, companyId, userId },
      }),
    );

    const invoke = (text: string) => {
      const repo = new PrismaAgentChatRepo();
      return new SendAgentMessageInteractor(
        repo,
        new AgentUsageService(repo),
        entitlements as never,
        backgroundTasks() as never,
      ).invoke({
        clientRequestId: randomUUID(),
        conversationId,
        text,
        retry: false,
      });
    };

    const outcomes = await Promise.allSettled([invoke("First admission"), invoke("Second admission")]);
    const admitted = outcomes.filter(
      (outcome) => outcome.status === "fulfilled" && outcome.value.ok && outcome.value.data.disposition === "run",
    );
    expect(admitted).toHaveLength(1);

    const [leases, events, turns] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentRunLease.count({ where: { userId } }),
        prisma.agentUsageEvent.findMany({ where: { userId } }),
        prisma.agentTurnRequest.count({ where: { userId } }),
      ]),
    );
    expect(leases).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.state).toBe("reserved");
    expect(turns).toBe(1);
  });

  it("lets one user hold a run in each of several conversations, which a suspended approval needs", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `parallel-${userId}@example.com`,
    });

    const invoke = () => {
      const repo = new PrismaAgentChatRepo();
      return new SendAgentMessageInteractor(
        repo,
        new AgentUsageService(repo),
        entitlements as never,
        backgroundTasks() as never,
      ).invoke({
        clientRequestId: randomUUID(),
        text: "A separate thread",
        retry: false,
      });
    };

    expect((await invoke()).ok).toBe(true);
    expect((await invoke()).ok).toBe(true);

    const [leases, conversations] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentRunLease.count({ where: { userId } }),
        prisma.agentConversation.count({ where: { userId } }),
      ]),
    );
    expect(leases).toBe(2);
    expect(conversations).toBe(2);
  });

  it("stops one user from holding more concurrent runs than the engine allows", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `capped-${userId}@example.com`,
    });

    const invoke = () => {
      const repo = new PrismaAgentChatRepo();
      return new SendAgentMessageInteractor(
        repo,
        new AgentUsageService(repo),
        entitlements as never,
        backgroundTasks() as never,
      ).invoke({
        clientRequestId: randomUUID(),
        text: "Another thread",
        retry: false,
      });
    };

    for (let index = 0; index < AGENT_MAX_CONCURRENT_RUNS_PER_USER; index += 1) expect((await invoke()).ok).toBe(true);

    await expect(invoke()).rejects.toThrow();

    const [leases, conversations] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentRunLease.count({ where: { userId } }),
        prisma.agentConversation.count({ where: { userId } }),
      ]),
    );
    expect(leases).toBe(AGENT_MAX_CONCURRENT_RUNS_PER_USER);
    expect(conversations).toBe(AGENT_MAX_CONCURRENT_RUNS_PER_USER);
  });

  it("rolls back partial chat admission and durably releases its credit reservation", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    const fixtureConversationId = randomUUID();
    const occupiedMessageId = randomUUID();
    const clientRequestId = randomUUID();
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `admission-${userId}@example.com`,
    });

    await runWithoutTenant(async () => {
      await prisma.agentConversation.create({
        data: {
          id: fixtureConversationId,
          companyId,
          userId,
          title: "Fixture",
        },
      });
      await prisma.agentMessage.create({
        data: {
          id: occupiedMessageId,
          conversationId: fixtureConversationId,
          companyId,
          role: "user",
          parts: [{ type: "text", text: "Fixture message" }],
        },
      });
    });

    class DuplicateMessageRepo extends PrismaAgentChatRepo {
      override admitAgentTurnOrThrow(args: Parameters<PrismaAgentChatRepoInstance["admitAgentTurnOrThrow"]>[0]) {
        if (args.turn.kind !== "create") return super.admitAgentTurnOrThrow(args);
        return super.admitAgentTurnOrThrow({
          ...args,
          turn: { ...args.turn, userMessageId: occupiedMessageId },
        });
      }
    }

    const failingRepo = new DuplicateMessageRepo();
    await expect(
      new SendAgentMessageInteractor(
        failingRepo,
        new AgentUsageService(failingRepo),
        entitlements as never,
        backgroundTasks() as never,
      ).invoke({
        clientRequestId,
        text: "Create an atomic admission",
        retry: false,
      }),
    ).rejects.toThrow();

    const afterFailure = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentUsageEvent.findMany({ where: { userId } }),
        prisma.agentRunLease.findFirst({ where: { userId } }),
        prisma.agentConversation.count({ where: { userId } }),
        prisma.agentTurnRequest.count({ where: { userId } }),
        prisma.agentMessage.count({ where: { companyId } }),
      ]),
    );
    expect(afterFailure[0]).toHaveLength(1);
    expect(afterFailure[0][0]).toMatchObject({
      state: "released",
      chargedCredits: 0,
      providerStartedAt: null,
    });
    expect(afterFailure[1]).toBeNull();
    expect(afterFailure[2]).toBe(1);
    expect(afterFailure[3]).toBe(0);
    expect(afterFailure[4]).toBe(1);

    const retryRepo = new PrismaAgentChatRepo();
    const retry = await new SendAgentMessageInteractor(
      retryRepo,
      new AgentUsageService(retryRepo),
      entitlements as never,
      backgroundTasks() as never,
    ).invoke({
      clientRequestId,
      text: "Create an atomic admission",
      retry: false,
    });
    expect(retry.ok && retry.data.disposition).toBe("run");
  });
});
