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
vi.mock("@/core/validation/zod-error-map-server", () => ({ getZodParseContext: vi.fn().mockResolvedValue(undefined) }));

const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");
const { AgentUsageService } = await import("@/ee/agent-chat/agent-usage.service");
const { SendAgentMessageInteractor } = await import("@/ee/agent-chat/send-agent-message.interactor");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
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
      repo.getUserCreditUsageUnscoped(reserved.companyId, userId, reserved.periodStart, reserved.periodEnd),
    );

    expect(usage.usedCredits).toBe(8);
  });

  it("rolls back a lease when phase-one credit reservation fails", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({ id: userId, companyId, email: `phase-one-${userId}@example.com` });
    const repo = new PrismaAgentChatRepo();
    const usage = new AgentUsageService(repo);
    const failure = new Error("forced reservation failure");
    vi.spyOn(usage, "reserveUsage").mockRejectedValue(failure);
    vi.spyOn(repo, "releasePreProviderAdmissionOrThrowUnscoped").mockResolvedValue({ disposition: "released" });

    await expect(
      new SendAgentMessageInteractor(repo, usage, entitlements as never).invoke({
        clientRequestId: randomUUID(),
        text: "Start a chat",
        retry: false,
      }),
    ).rejects.toBe(failure);

    const [lease, events, conversations, turns] = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentRunLease.findUnique({ where: { userId } }),
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

  it("commits only one lease and reservation for concurrent admissions", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    authState.user = createMockUser({ id: userId, companyId, email: `concurrent-${userId}@example.com` });
    const invoke = (text: string) => {
      const repo = new PrismaAgentChatRepo();
      return new SendAgentMessageInteractor(repo, new AgentUsageService(repo), entitlements as never).invoke({
        clientRequestId: randomUUID(),
        text,
        retry: false,
      });
    };

    const outcomes = await Promise.allSettled([invoke("First admission"), invoke("Second admission")]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);

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

  it("rolls back partial chat admission and durably releases its credit reservation", async () => {
    const anchor = new Date(Date.UTC(2026, 0, 15));
    const { companyId, userId } = await seedActiveSeat(anchor);
    const fixtureConversationId = randomUUID();
    const occupiedMessageId = randomUUID();
    const clientRequestId = randomUUID();
    authState.user = createMockUser({ id: userId, companyId, email: `admission-${userId}@example.com` });

    await runWithoutTenant(async () => {
      await prisma.agentConversation.create({
        data: { id: fixtureConversationId, companyId, userId, title: "Fixture" },
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
      new SendAgentMessageInteractor(failingRepo, new AgentUsageService(failingRepo), entitlements as never).invoke({
        clientRequestId,
        text: "Create an atomic admission",
        retry: false,
      }),
    ).rejects.toThrow();

    const afterFailure = await runWithoutTenant(() =>
      Promise.all([
        prisma.agentUsageEvent.findMany({ where: { userId } }),
        prisma.agentRunLease.findUnique({ where: { userId } }),
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
    ).invoke({
      clientRequestId,
      text: "Create an atomic admission",
      retry: false,
    });
    expect(retry.ok && retry.data.disposition).toBe("run");
  });
});
