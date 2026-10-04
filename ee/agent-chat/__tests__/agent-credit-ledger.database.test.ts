import { randomUUID } from "node:crypto";

import { describe, it, expect, afterAll, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import type { TenantUser } from "@/features/user/user.schema";
import { buildAgentUsageSettlement } from "../agent-usage-settlement";

const authState = vi.hoisted(() => ({ user: null as TenantUser | null }));

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
vi.mock("next/headers", () => ({
  headers: () => new Headers({ origin: "http://localhost:4000" }),
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
const { prismaAgentChatRepoDependencies } = await import("@/tests/helpers/prisma-agent-chat-repo");
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

const emptyWikiCatalog = () => ({
  invoke: vi.fn().mockResolvedValue({
    ok: true,
    data: {
      items: [],
      total: 0,
      page: 1,
      nextPage: null,
      truncated: false,
    },
  }),
});

const emptyCustomColumns = () => ({
  getCustomColumns: () => Promise.resolve([]),
});

const backgroundTasks = () => ({
  dispatch: vi.fn().mockResolvedValue(undefined),
  dispatchTracked: vi.fn().mockResolvedValue("wrun_test"),
  resume: vi.fn().mockResolvedValue(true),
});

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const entitlements = { require: vi.fn().mockResolvedValue(null) };

const CREDIT = 1_000_000;

describeDatabase("agent credit ledger against a real database", { timeout: 120_000 }, () => {
  it("admits only as many concurrent reservations as the allowance permits", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);

    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const reserve = (reservedCredits: number) =>
      runWithoutTenant(() =>
        repo.reserveUsageEventUnscoped({
          id: randomUUID(),
          companyId,
          userId,
          sessionId: randomUUID(),
          reservedMicrocents: reservedCredits * CREDIT,
          planSnapshot: "starter",
          subscriptionStatusSnapshot: "active",
          allowanceMicrocentsSnapshot: 800 * CREDIT,
          periodStart: anchor,
          periodEnd: anchor,
        }),
      );

    await reserve(797);

    const outcomes = await Promise.allSettled([reserve(1), reserve(1), reserve(1), reserve(1), reserve(1)]);
    const accepted = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected").length;

    expect(accepted).toBe(3);
    expect(rejected).toBe(2);

    const rows = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findMany({
        where: { userId },
        select: { reservedMicrocents: true, state: true },
      }),
    );
    const reservedTotal = rows.reduce((total, row) => total + Number(row.reservedMicrocents), 0);

    expect(reservedTotal).toBe(800 * CREDIT);
    expect(rows.every((row) => row.state === "reserved")).toBe(true);
  });

  it("never lets a reservation exceed the allowance even when issued alone", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());

    await expect(
      runWithoutTenant(() =>
        repo.reserveUsageEventUnscoped({
          id: randomUUID(),
          companyId,
          userId,
          sessionId: randomUUID(),
          reservedMicrocents: 801 * CREDIT,
          planSnapshot: "starter",
          subscriptionStatusSnapshot: "active",
          allowanceMicrocentsSnapshot: 800 * CREDIT,
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
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const reservationId = randomUUID();

    await runWithoutTenant(() =>
      repo.reserveUsageEventUnscoped({
        id: reservationId,
        companyId,
        userId,
        sessionId: randomUUID(),
        reservedMicrocents: 8 * CREDIT,
        planSnapshot: "starter",
        subscriptionStatusSnapshot: "active",
        allowanceMicrocentsSnapshot: 800 * CREDIT,
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

    expect(usage.usedMicrocents).toBe(8 * CREDIT);
  });

  it("pools the active members' allowances for workspace-paid Wiki indexing", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const now = new Date();
    const { companyId, userId } = await seedActiveSeat(anchor);
    const colleagueId = randomUUID();
    const inactiveId = randomUUID();
    await runWithoutTenant(() =>
      prisma.user.createMany({
        data: [
          {
            id: colleagueId,
            companyId,
            email: `credit-${colleagueId}@example.com`,
            firstName: "Credit",
            lastName: "Colleague",
            status: "active",
            agentCreditActivatedAt: anchor,
          },
          {
            id: inactiveId,
            companyId,
            email: `credit-${inactiveId}@example.com`,
            firstName: "Credit",
            lastName: "Inactive",
            status: "inactive",
            agentCreditActivatedAt: null,
          },
        ],
      }),
    );
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const empty = await runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now));
    if (!empty) throw new Error("Expected a workspace credit pool.");
    expect(empty).toMatchObject({ limitMicrocents: 1_600 * CREDIT, usedMicrocents: 0, usable: true, plan: "starter" });

    await runWithoutTenant(() =>
      prisma.agentCreditAdjustment.create({
        data: {
          companyId,
          userId: colleagueId,
          deltaMicrocents: 2_500_000n,
          periodStart: empty.periodStart,
          periodEnd: empty.periodEnd,
          operationId: randomUUID(),
          createdByOperatorUserId: "fixture",
        },
      }),
    );
    await runWithoutTenant(() =>
      repo.reserveUsageEventUnscoped({
        id: randomUUID(),
        companyId,
        userId,
        sessionId: randomUUID(),
        reservedMicrocents: 1_234_567,
        planSnapshot: "starter",
        subscriptionStatusSnapshot: "active",
        allowanceMicrocentsSnapshot: 800 * CREDIT,
        periodStart: empty.periodStart,
        periodEnd: empty.periodEnd,
      }),
    );
    const indexingGrant = {
      purpose: "wikiIndexing" as const,
      companyId,
      userId: null,
      planSnapshot: "starter" as const,
      subscriptionStatusSnapshot: "active" as const,
      allowanceMicrocentsSnapshot: empty.limitMicrocents,
      periodStart: empty.periodStart,
      periodEnd: empty.periodEnd,
    };
    const indexingHold = await runWithoutTenant(() =>
      repo.reserveRetrievalUsageUnscoped({ grant: indexingGrant, reservedMicrocents: 90, model: "embedding", now }),
    );
    if (!indexingHold) throw new Error("Expected an indexing reservation.");
    await runWithoutTenant(() =>
      repo.settleRetrievalUsageUnscoped({
        grant: indexingGrant,
        reservationId: indexingHold,
        reservedMicrocents: 90,
        reservedAt: now,
        charge: { model: "embedding", inputTokens: 10, costMicrocents: 42, costSource: "measured" },
        payer: "grant",
        now,
      }),
    );

    await expect(runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now))).resolves.toMatchObject({
      limitMicrocents: 1_602_500_000,
      usedMicrocents: 1_234_609,
      unassignedMicrocents: 42,
      memberLimitMicrocents: { [userId]: 800 * CREDIT, [colleagueId]: 802_500_000 },
      usable: true,
    });
    await expect(
      runWithoutTenant(() => repo.getUserCreditUsageUnscoped(companyId, userId, empty.periodStart, empty.periodEnd)),
    ).resolves.toEqual({ usedMicrocents: 1_234_567, recentTurnMicrocents: null });
    await expect(
      runWithoutTenant(() =>
        repo.getUserCreditUsageUnscoped(companyId, colleagueId, empty.periodStart, empty.periodEnd),
      ),
    ).resolves.toEqual({ usedMicrocents: 0, recentTurnMicrocents: null });
  });

  it("reserves an embedding's worst case, settles its exact cost, and refunds a failed call on one row per payer", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const now = new Date();
    const { companyId, userId } = await seedActiveSeat(anchor);
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const pool = await runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now));
    if (!pool) throw new Error("Expected a workspace credit pool.");
    const grant = (payer: string | null) => ({
      purpose: payer ? ("wikiRetrieval" as const) : ("wikiIndexing" as const),
      companyId,
      userId: payer,
      planSnapshot: "starter" as const,
      subscriptionStatusSnapshot: "active" as const,
      allowanceMicrocentsSnapshot: pool.limitMicrocents,
      periodStart: pool.periodStart,
      periodEnd: pool.periodEnd,
    });
    const call = async (payer: string | null, reservedMicrocents: number, costMicrocents: number | null) => {
      const hold = await runWithoutTenant(() =>
        repo.reserveRetrievalUsageUnscoped({ grant: grant(payer), reservedMicrocents, model: "embedding", now }),
      );
      if (!hold) throw new Error("Expected a retrieval reservation.");
      await runWithoutTenant(() =>
        repo.settleRetrievalUsageUnscoped({
          grant: grant(payer),
          reservationId: hold,
          payer: "grant",
          reservedMicrocents,
          reservedAt: now,
          charge:
            costMicrocents === null
              ? null
              : { model: "embedding", inputTokens: 10, costMicrocents, costSource: "measured" },
          now,
        }),
      );
    };
    await call(userId, CREDIT, 400_000);
    await call(userId, CREDIT, 700_001);
    await call(userId, 500, null);
    await call(null, 100, 37);
    await call(null, 10, 5);
    await call(null, 3, 9);

    const rows = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findMany({
        where: { companyId },
        orderBy: { purpose: "asc" },
        select: {
          purpose: true,
          userId: true,
          state: true,
          costMicrocents: true,
          chargedMicrocents: true,
          reservedMicrocents: true,
          inputTokens: true,
        },
      }),
    );
    expect(rows).toEqual([
      {
        purpose: "wikiRetrieval",
        userId,
        state: "settled",
        costMicrocents: 1_100_001n,
        chargedMicrocents: 1_100_001n,
        reservedMicrocents: 1_100_001n,
        inputTokens: 20,
      },
      {
        purpose: "wikiIndexing",
        userId: null,
        state: "settled",
        costMicrocents: 51n,
        chargedMicrocents: 45n,
        reservedMicrocents: 45n,
        inputTokens: 30,
      },
    ]);
  });

  it("lets workspace indexing reduce what members can spend and never commits more than the pooled allowance", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const now = new Date();
    const { companyId, userId } = await seedActiveSeat(anchor);
    const colleagueId = randomUUID();
    await runWithoutTenant(() =>
      prisma.user.create({
        data: {
          id: colleagueId,
          companyId,
          email: `credit-${colleagueId}@example.com`,
          firstName: "Credit",
          lastName: "Colleague",
          status: "active",
          agentCreditActivatedAt: anchor,
        },
      }),
    );
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const pool = await runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now));
    if (!pool) throw new Error("Expected a workspace credit pool.");
    expect(pool.limitMicrocents).toBe(1_600 * CREDIT);
    const reserve = (payer: string, reservedMicrocents: number) =>
      runWithoutTenant(() =>
        repo.reserveUsageEventUnscoped({
          id: randomUUID(),
          companyId,
          userId: payer,
          sessionId: randomUUID(),
          reservedMicrocents,
          planSnapshot: "starter",
          subscriptionStatusSnapshot: "active",
          allowanceMicrocentsSnapshot: 800 * CREDIT,
          periodStart: pool.periodStart,
          periodEnd: pool.periodEnd,
        }),
      );
    const indexing = (reservedMicrocents: number) =>
      runWithoutTenant(() =>
        repo.reserveRetrievalUsageUnscoped({
          grant: {
            purpose: "wikiIndexing",
            companyId,
            userId: null,
            planSnapshot: "starter",
            subscriptionStatusSnapshot: "active",
            allowanceMicrocentsSnapshot: pool.limitMicrocents,
            periodStart: pool.periodStart,
            periodEnd: pool.periodEnd,
          },
          reservedMicrocents,
          model: "embedding",
          now,
        }),
      );
    const service = new AgentUsageService(repo);

    await reserve(userId, 800 * CREDIT);
    await expect(indexing(600 * CREDIT)).resolves.toEqual(expect.any(String));
    await expect(runWithoutTenant(() => service.getUsageSummary(colleagueId, now))).resolves.toMatchObject({
      creditsUsed: 300,
      creditsRemaining: 200,
      creditsLimit: 800,
    });

    await expect(reserve(colleagueId, 200 * CREDIT + 1)).rejects.toThrow(/exceeds the current allowance/);
    await expect(reserve(colleagueId, 200 * CREDIT)).resolves.toBe(true);
    await expect(indexing(1)).resolves.toBeNull();

    const committed = await runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now));
    expect(committed).toMatchObject({ usedMicrocents: 1_600 * CREDIT, limitMicrocents: 1_600 * CREDIT });
  });

  it.each([
    ["deactivated", { status: "inactive" as const }],
    ["blocked", { agentCreditActivatedAt: null }],
  ])(
    "stops counting a %s member's spend against the colleagues whose allowances remain in the pool",
    async (_label, change) => {
      const anchor = new Date(Date.UTC(2026, 0, 15));
      const now = new Date();
      const { companyId, userId } = await seedActiveSeat(anchor);
      const colleagueId = randomUUID();
      await runWithoutTenant(() =>
        prisma.user.create({
          data: {
            id: colleagueId,
            companyId,
            email: `credit-${colleagueId}@example.com`,
            firstName: "Credit",
            lastName: "Colleague",
            status: "active",
            agentCreditActivatedAt: anchor,
          },
        }),
      );
      const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
      const pool = await runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now));
      if (!pool) throw new Error("Expected a workspace credit pool.");
      const reserve = (payer: string, reservedMicrocents: number) =>
        runWithoutTenant(() =>
          repo.reserveUsageEventUnscoped({
            id: randomUUID(),
            companyId,
            userId: payer,
            sessionId: randomUUID(),
            reservedMicrocents,
            planSnapshot: "starter",
            subscriptionStatusSnapshot: "active",
            allowanceMicrocentsSnapshot: 800 * CREDIT,
            periodStart: pool.periodStart,
            periodEnd: pool.periodEnd,
          }),
        );

      await expect(reserve(userId, 800 * CREDIT)).resolves.toBe(true);
      await runWithoutTenant(() => prisma.user.update({ where: { id: userId }, data: change }));

      await expect(runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now))).resolves.toMatchObject({
        limitMicrocents: 800 * CREDIT,
        usedMicrocents: 0,
        memberLimitMicrocents: { [colleagueId]: 800 * CREDIT },
      });
      const indexingHold = await runWithoutTenant(() =>
        repo.reserveRetrievalUsageUnscoped({
          grant: {
            purpose: "wikiIndexing",
            companyId,
            userId: null,
            planSnapshot: "starter",
            subscriptionStatusSnapshot: "active",
            allowanceMicrocentsSnapshot: 800 * CREDIT,
            periodStart: pool.periodStart,
            periodEnd: pool.periodEnd,
          },
          reservedMicrocents: 10 * CREDIT,
          model: "embedding",
          now,
        }),
      );
      expect(indexingHold).toEqual(expect.any(String));
      await expect(reserve(colleagueId, 790 * CREDIT + 1)).rejects.toThrow(/exceeds the current allowance/);
      await expect(reserve(colleagueId, 790 * CREDIT)).resolves.toBe(true);
      await expect(runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now))).resolves.toMatchObject({
        limitMicrocents: 800 * CREDIT,
        usedMicrocents: 800 * CREDIT,
        unassignedMicrocents: 10 * CREDIT,
      });
    },
  );

  it("holds an embedding reservation until it settles and releases one its process abandoned", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const now = new Date();
    const staleAt = new Date(now.getTime() - 20 * 60 * 1000);
    const { companyId, userId } = await seedActiveSeat(anchor);
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const pool = await runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now));
    if (!pool) throw new Error("Expected a workspace credit pool.");
    const grant = {
      purpose: "wikiRetrieval" as const,
      companyId,
      userId,
      planSnapshot: "starter" as const,
      subscriptionStatusSnapshot: "active" as const,
      allowanceMicrocentsSnapshot: pool.limitMicrocents,
      periodStart: pool.periodStart,
      periodEnd: pool.periodEnd,
    };
    const reserve = (at: Date) =>
      runWithoutTenant(() =>
        repo.reserveRetrievalUsageUnscoped({ grant, reservedMicrocents: 5 * CREDIT, model: "embedding", now: at }),
      );

    const abandoned = await reserve(staleAt);
    if (!abandoned) throw new Error("Expected a retrieval reservation.");
    await expect(
      runWithoutTenant(() => prisma.agentUsageEvent.findUniqueOrThrow({ where: { id: abandoned } })),
    ).resolves.toMatchObject({ state: "reserved", reservedMicrocents: 5_000_000n, chargedMicrocents: 0n });
    await expect(runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now))).resolves.toMatchObject({
      usedMicrocents: 5 * CREDIT,
    });

    await expect(
      runWithoutTenant(() =>
        repo.releaseStaleRetrievalReservationsUnscoped({
          companyId,
          reservedBefore: new Date(now.getTime() - 15 * 60 * 1000),
          now,
        }),
      ),
    ).resolves.toBe(1);
    await expect(
      runWithoutTenant(() => prisma.agentUsageEvent.findUniqueOrThrow({ where: { id: abandoned } })),
    ).resolves.toMatchObject({ state: "released", chargedMicrocents: 0n });
    await expect(runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now))).resolves.toMatchObject({
      usedMicrocents: 0,
    });
    await expect(
      runWithoutTenant(() =>
        repo.settleRetrievalUsageUnscoped({
          grant,
          reservationId: abandoned,
          reservedMicrocents: 5 * CREDIT,
          reservedAt: staleAt,
          charge: null,
          payer: "grant",
          now,
        }),
      ),
    ).rejects.toThrow("Retrieval credit reservation could not be settled.");

    const lazilySwept = await reserve(staleAt);
    const fresh = await reserve(now);
    if (!lazilySwept || !fresh) throw new Error("Expected retrieval reservations.");
    await expect(
      runWithoutTenant(() => prisma.agentUsageEvent.findUniqueOrThrow({ where: { id: lazilySwept } })),
    ).resolves.toMatchObject({ state: "released" });
    await expect(runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now))).resolves.toMatchObject({
      usedMicrocents: 5 * CREDIT,
    });
  });

  it("charges the platform, not the searcher, for a query embedding no search used", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const now = new Date();
    const { companyId, userId } = await seedActiveSeat(anchor);
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const pool = await runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now));
    if (!pool) throw new Error("Expected a workspace credit pool.");
    const grant = {
      purpose: "wikiRetrieval" as const,
      companyId,
      userId,
      planSnapshot: "starter" as const,
      subscriptionStatusSnapshot: "active" as const,
      allowanceMicrocentsSnapshot: pool.limitMicrocents,
      periodStart: pool.periodStart,
      periodEnd: pool.periodEnd,
    };
    const accrualMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const platformCost = async () =>
      (
        await runWithoutTenant(() =>
          prisma.hostedAiPlatformUsage.findUnique({
            where: { purpose_accrualMonth: { purpose: "wikiQueryEmbeddingUnused", accrualMonth } },
          }),
        )
      )?.costMicrocents ?? 0n;
    const before = await platformCost();

    const hold = await runWithoutTenant(() =>
      repo.reserveRetrievalUsageUnscoped({ grant, reservedMicrocents: 900, model: "embedding", now }),
    );
    if (!hold) throw new Error("Expected a retrieval reservation.");
    await runWithoutTenant(() =>
      repo.settleRetrievalUsageUnscoped({
        grant,
        reservationId: hold,
        reservedMicrocents: 900,
        reservedAt: now,
        charge: { model: "embedding", inputTokens: 12, costMicrocents: 180, costSource: "measured" },
        payer: "platform",
        now,
      }),
    );

    await expect(runWithoutTenant(() => prisma.agentUsageEvent.count({ where: { companyId } }))).resolves.toBe(0);
    await expect(runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now))).resolves.toMatchObject({
      usedMicrocents: 0,
    });
    expect((await platformCost()) - before).toBe(180n);
  });

  it("admits a reservation to the exact microcent of the remaining allowance", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const reserve = (reservedMicrocents: number) =>
      runWithoutTenant(() =>
        repo.reserveUsageEventUnscoped({
          id: randomUUID(),
          companyId,
          userId,
          sessionId: randomUUID(),
          reservedMicrocents,
          planSnapshot: "starter",
          subscriptionStatusSnapshot: "active",
          allowanceMicrocentsSnapshot: 800 * CREDIT,
          periodStart: anchor,
          periodEnd: anchor,
        }),
      );

    await reserve(799 * CREDIT + 249_999);
    await expect(reserve(750_002)).rejects.toThrow(/exceeds the current allowance/);
    await expect(reserve(750_001)).resolves.toBe(true);

    const rows = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { reservedMicrocents: true, allowanceMicrocentsSnapshot: true },
      }),
    );
    expect(rows).toEqual([
      { reservedMicrocents: 799_249_999n, allowanceMicrocentsSnapshot: 800_000_000n },
      { reservedMicrocents: 750_001n, allowanceMicrocentsSnapshot: 800_000_000n },
    ]);
  });

  it("binds the reservation to the turn, so it survives the run id changing under it", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `rekey-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
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
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
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
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
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
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
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
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
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
      reservedMicrocents: reserved.reservedMicrocents,
      chargedMicrocents: reserved.reservedMicrocents,
    });
    expect(committedUsage).toEqual({
      usedMicrocents: Number(reserved.reservedMicrocents),
      recentTurnMicrocents: Number(reserved.reservedMicrocents),
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
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
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
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
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
      servingProvider: "azure",
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

  it("persists mixed Search costs in ordinary credit usage without double-charging finalization", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `search-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const admitted = await new SendAgentMessageInteractor(
      repo,
      new AgentUsageService(repo),
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Search and answer",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted turn.");
    const { turnRequestId, conversationId, runId } = admitted.data;
    const identity = {
      turnRequestId,
      conversationId,
      runId,
      companyId,
      userId,
    };
    await runWithoutTenant(() => repo.markAgentTurnProviderStartedUnscoped(identity));
    const reserved = await runWithoutTenant(() =>
      prisma.agentUsageEvent.findFirstOrThrow({
        where: { turnRequestId, companyId, userId, state: "reserved" },
      }),
    );
    const usageSettlement = buildAgentUsageSettlement({
      model: "google/gemini-3.5-flash-lite",
      provider: "vertex",
      inferenceRegion: "eu",
      tokens: {
        inputTokens: 2,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      reservedMicrocents: Number(reserved.reservedMicrocents),
      providerCharge: {
        billed: true,
        measuredCostMicrocents: null,
        estimatedCostMicrocents: 1_080_587,
        stepTokens: [],
        unreadableReason: "missing later-round metadata",
      },
    });
    const finalize = () =>
      runWithoutTenant(() =>
        repo.finalizeAgentTurnOrThrowUnscoped({
          ...identity,
          parts: [{ type: "text", text: "Search answer" }],
          terminalCode: "completed",
          stopReason: null,
          affectedResources: [],
          usageSettlement,
        }),
      );
    await finalize();
    await expect(finalize()).rejects.toThrow("no longer active");

    const [events, usage, replies] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentUsageEvent.findMany({
          where: { turnRequestId, companyId, userId },
        }),
        repo.getUserCreditUsageUnscoped(companyId, userId, reserved.periodStart, reserved.periodEnd),
        prisma.agentMessage.count({
          where: { turnRequestId, companyId, role: "assistant" },
        }),
      ]),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      state: "settled",
      costMicrocents: 1_080_587n,
      costSource: "estimated",
      chargedMicrocents: 1_080_587n,
      policyBreach: false,
    });
    expect(usage).toEqual({ usedMicrocents: 1_080_587, recentTurnMicrocents: 1_080_587 });
    expect(replies).toBe(1);
  });

  it("takes a conversation's rounds with it on delete while its billing survives", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({
      id: userId,
      companyId,
      email: `cascade-${userId}@example.com`,
    });
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
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
        servingProvider: "azure",
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
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
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
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);

    const admitted = await new SendAgentMessageInteractor(
      repo,
      usage,
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
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
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);
    const failure = new Error("forced reservation failure");
    vi.spyOn(usage, "reserveUsage").mockRejectedValue(failure);
    vi.spyOn(repo, "releasePreProviderAdmissionOrThrowUnscoped").mockResolvedValue({ disposition: "released" });

    await expect(
      new SendAgentMessageInteractor(
        repo,
        usage,
        entitlements as never,
        backgroundTasks() as never,
        emptyCustomColumns(),
        emptyWikiCatalog(),
      ).invoke({
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
      const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
      return new SendAgentMessageInteractor(
        repo,
        new AgentUsageService(repo),
        entitlements as never,
        backgroundTasks() as never,
        emptyCustomColumns(),
        emptyWikiCatalog(),
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
      const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
      return new SendAgentMessageInteractor(
        repo,
        new AgentUsageService(repo),
        entitlements as never,
        backgroundTasks() as never,
        emptyCustomColumns(),
        emptyWikiCatalog(),
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
      const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
      return new SendAgentMessageInteractor(
        repo,
        new AgentUsageService(repo),
        entitlements as never,
        backgroundTasks() as never,
        emptyCustomColumns(),
        emptyWikiCatalog(),
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

    const failingRepo = new DuplicateMessageRepo(...prismaAgentChatRepoDependencies());
    await expect(
      new SendAgentMessageInteractor(
        failingRepo,
        new AgentUsageService(failingRepo),
        entitlements as never,
        backgroundTasks() as never,
        emptyCustomColumns(),
        emptyWikiCatalog(),
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
      chargedMicrocents: 0n,
      providerStartedAt: null,
    });
    expect(afterFailure[1]).toBeNull();
    expect(afterFailure[2]).toBe(1);
    expect(afterFailure[3]).toBe(0);
    expect(afterFailure[4]).toBe(1);

    const retryRepo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const retry = await new SendAgentMessageInteractor(
      retryRepo,
      new AgentUsageService(retryRepo),
      entitlements as never,
      backgroundTasks() as never,
      emptyCustomColumns(),
      emptyWikiCatalog(),
    ).invoke({
      clientRequestId,
      text: "Create an atomic admission",
      retry: false,
    });
    expect(retry.ok && retry.data.disposition).toBe("run");
  });
});
