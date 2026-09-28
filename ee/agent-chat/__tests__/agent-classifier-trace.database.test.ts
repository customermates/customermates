import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { TenantUser } from "@/features/user/user.schema";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { createMockUser } from "@/tests/helpers/mock-user";

const authState = vi.hoisted(() => ({ user: null as TenantUser | null }));

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    CLOUD_HOSTED: true,
    AGENT_CHAT_DISABLED: false,
    AGENT_DOCS_RERANK: "off",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    BASE_URL: "http://localhost:4000",
    AUTH_ALLOWED_HOSTS: ["localhost:4000"],
    AI_GATEWAY_API_KEY: undefined,
    HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS: null,
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: false,
    HOSTED_AI_PROVIDER_WORK_PAUSED: false,
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
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setTag: vi.fn(), setUser: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ origin: "http://localhost:4000" })),
}));

const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { prisma } = await import("@/prisma/db");
const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");
const { SendAgentMessageInteractor } = await import("@/ee/agent-chat/send-agent-message.interactor");
const { AgentUsageService } = await import("@/ee/agent-chat/agent-usage.service");
const { buildAgentUsageSettlement } = await import("@/ee/agent-chat/agent-usage-settlement");
const { buildAgentTurnClassifierTrace } = await import("@/ee/agent-chat/agent-classifier-trace");

const companyId = randomUUID();
const userId = randomUUID();
const tenantUser = createMockUser({ id: userId, companyId, email: `classifier-trace-${userId}@example.com` });

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("agent turn classifier trace persistence", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    const creditAnchor = new Date("2026-09-01T00:00:00.000Z");
    authState.user = tenantUser;
    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.subscription.create({
        data: { companyId, status: "active", plan: "starter", agentCreditAnchorAt: creditAnchor },
      });
      await prisma.user.create({
        data: {
          id: userId,
          companyId,
          email: tenantUser.email,
          firstName: tenantUser.firstName,
          lastName: tenantUser.lastName,
          status: "active",
          agentCreditActivatedAt: creditAnchor,
        },
      });
    });
  });

  afterAll(async () => {
    authState.user = null;
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: companyId } }));
    await prisma.$disconnect();
  });

  it("stores the classifier trace on the turn and settles its cost into the one usage event", async () => {
    const repo = new PrismaAgentChatRepo();
    const admitted = await new SendAgentMessageInteractor(
      repo,
      new AgentUsageService(repo),
      mockEntitlementService(),
      {
        dispatch: vi.fn().mockResolvedValue(undefined),
        dispatchTracked: vi.fn().mockResolvedValue("wrun_classifier_trace"),
        resume: vi.fn().mockResolvedValue(true),
      } as never,
      { getCustomColumns: () => Promise.resolve([]) } as never,
      {
        invoke: vi.fn().mockResolvedValue({
          ok: true,
          data: { items: [], total: 0, page: 1, nextPage: null, truncated: false },
        }),
      },
    ).invoke({
      clientRequestId: randomUUID(),
      text: "Which header does the REST API expect?",
      pageContext: { route: "/en/contacts" },
      locale: "en",
      retry: false,
    });
    if (!admitted.ok || admitted.data.disposition !== "run") throw new Error("Expected an admitted agent turn.");
    const run = admitted.data;
    const turn = {
      turnRequestId: run.turnRequestId,
      conversationId: run.conversationId,
      companyId,
      userId,
      runId: run.runId,
    };
    await expect(repo.markAgentTurnProviderStartedUnscoped(turn)).resolves.toBe(true);

    const charges = [
      { use: "docs_rerank" as const, model: "jev" as const, costMicrocents: 1_600, measured: true, answered: true },
      { use: "docs_rerank" as const, model: "jev" as const, costMicrocents: 350, measured: true, answered: false },
    ];
    const classifierTrace = buildAgentTurnClassifierTrace(charges);
    const usageSettlement = buildAgentUsageSettlement({
      model: run.turnBudget.modelSpec,
      provider: run.turnBudget.servingProvider,
      inferenceRegion: run.turnBudget.inferenceRegion,
      tokens: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      reservedCredits: run.turnBudget.reservedCredits,
      providerCharge: { billed: true, measuredCostMicrocents: 50_000, stepTokens: [], unreadableReason: null },
      auxiliary: { costMicrocents: 1_950, measured: true },
    });

    await repo.finalizeAgentTurnOrThrowUnscoped({
      ...turn,
      parts: [{ type: "text", text: "Use the x-api-key header." }],
      terminalCode: "completed",
      stopReason: null,
      affectedResources: [],
      usageSettlement,
      classifierTrace,
    });

    const stored = await runWithoutTenant(() =>
      prisma.agentTurnRequest.findUniqueOrThrow({
        where: { id: run.turnRequestId },
        include: { usageEvents: true, rounds: true },
      }),
    );
    expect(stored.classifierTrace).toEqual(classifierTrace);
    expect(stored.classifierTrace).toEqual({
      auxiliaryCostMicrocents: 1_950,
      auxiliaryMeasured: true,
      docsRerank: { model: "jev", calls: 2, answered: 1, costMicrocents: 1_950, measured: true },
    });
    expect(stored.rounds).toHaveLength(0);
    expect(stored.usageEvents).toHaveLength(1);
    expect(stored.usageEvents[0]).toMatchObject({ state: "settled", costSource: "measured", costMicrocents: 51_950n });
  });

  it.each([{ auxiliaryCostMicrocents: -5 }, { auxiliaryCostMicrocents: 1.5 }])(
    "refuses a malformed classifier trace before touching the turn (%o)",
    async (malformed) => {
      await expect(
        new PrismaAgentChatRepo().finalizeAgentTurnOrThrowUnscoped({
          turnRequestId: randomUUID(),
          conversationId: randomUUID(),
          companyId,
          userId,
          runId: randomUUID(),
          parts: [{ type: "text", text: "Done." }],
          terminalCode: "completed",
          stopReason: null,
          affectedResources: [],
          usageSettlement: null,
          classifierTrace: {
            auxiliaryMeasured: true,
            docsRerank: null,
            ...malformed,
          },
        }),
      ).rejects.toThrow("Agent turn classifier trace is invalid.");
    },
  );
});
