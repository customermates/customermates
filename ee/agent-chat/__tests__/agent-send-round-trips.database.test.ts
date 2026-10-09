import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma";
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
    AUTH_ALLOWED_HOSTS: ["localhost:4000"],
    AI_GATEWAY_API_KEY: undefined,
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
    HOSTED_AI_PROVIDER_WORK_PAUSED: false,
    HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS: 10n ** 15n,
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

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;
const recorder = { active: false, statements: [] as string[] };

if (databaseUrl) {
  const counted = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    log: [{ emit: "event", level: "query" }],
  });
  counted.$on("query", (event) => {
    if (recorder.active) recorder.statements.push(event.query);
  });
  (globalThis as { prisma?: unknown }).prisma = counted;
}

const { PrismaAgentChatRepo } = await import("@/ee/agent-chat/prisma-agent-chat.repository");
const { prismaAgentChatRepoDependencies } = await import("@/tests/helpers/prisma-agent-chat-repo");
const { AgentUsageService } = await import("@/ee/agent-chat/agent-usage.service");
const { SendAgentMessageInteractor } = await import("@/ee/agent-chat/send-agent-message.interactor");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const companyIds: string[] = [];

afterAll(async () => {
  for (const companyId of companyIds) {
    await runWithoutTenant(async () => {
      await prisma.agentUsageEvent.deleteMany({ where: { companyId } });
      await prisma.agentRunLease.deleteMany({ where: { companyId } });
      await prisma.agentMessage.deleteMany({ where: { companyId } });
      await prisma.agentTurnRequest.deleteMany({ where: { companyId } });
      await prisma.agentConversation.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.subscription.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    });
  }
  await prisma.$disconnect();
});

async function seedSeat() {
  const companyId = randomUUID();
  const userId = randomUUID();
  const anchor = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  companyIds.push(companyId);
  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    await prisma.subscription.create({
      data: {
        companyId,
        status: "active",
        plan: "starter",
        agentCreditAnchorAt: anchor,
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        companyId,
        email: `round-trips-${userId}@example.invalid`,
        firstName: "Round",
        lastName: "Trip",
        status: "active",
        agentCreditActivatedAt: anchor,
      },
    });
  });
  authState.user = createMockUser({
    id: userId,
    companyId,
    email: `round-trips-${userId}@example.invalid`,
  });
  return { companyId, userId };
}

async function seedConversationWithHistory(companyId: string, userId: string) {
  const conversationId = randomUUID();
  await runWithoutTenant(async () => {
    await prisma.agentConversation.create({
      data: { id: conversationId, companyId, userId, title: "Earlier" },
    });
    await prisma.agentMessage.create({
      data: {
        conversationId,
        companyId,
        role: "user",
        parts: [{ type: "text", text: "Earlier question" }],
      },
    });
    await prisma.agentMessage.create({
      data: {
        conversationId,
        companyId,
        role: "assistant",
        parts: [{ type: "text", text: "Earlier answer" }],
      },
    });
  });
  return conversationId;
}

function interactor() {
  const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
  return new SendAgentMessageInteractor(
    repo,
    new AgentUsageService(repo),
    { require: vi.fn().mockResolvedValue(null) } as never,
    {
      dispatch: vi.fn().mockResolvedValue(undefined),
      dispatchTracked: vi.fn().mockResolvedValue("wrun_round_trips"),
      resume: vi.fn().mockResolvedValue(true),
    } as never,
    { getCustomColumns: () => Promise.resolve([]) },
    {
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
    },
  );
}

async function measure(send: () => ReturnType<InstanceType<typeof SendAgentMessageInteractor>["invoke"]>) {
  recorder.statements = [];
  recorder.active = true;
  const startedAt = performance.now();
  const result = await send();
  const elapsedMs = performance.now() - startedAt;
  recorder.active = false;
  const statements = [...recorder.statements];
  return {
    result,
    elapsedMs,
    statements: statements.length,
    transactions: statements.filter((statement) => /^\s*COMMIT/i.test(statement)).length,
    companyLocks: statements.filter((statement) => statement.includes("pg_advisory_xact_lock(hashtextextended($1"))
      .length,
    log: statements,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describeDatabase("chat send database round trips", { timeout: 120_000 }, () => {
  it("admits a first turn and a follow-up within a bounded number of statements and transactions", async () => {
    const samples = {
      first: [] as Awaited<ReturnType<typeof measure>>[],
      followUp: [] as Awaited<ReturnType<typeof measure>>[],
    };
    for (let index = 0; index < 9; index += 1) {
      const { companyId, userId } = await seedSeat();
      const first = await measure(() =>
        interactor().invoke({
          clientRequestId: randomUUID(),
          text: "Start a chat",
          retry: false,
        }),
      );
      expect(first.result.ok && first.result.data.disposition).toBe("run");
      samples.first.push(first);

      const conversationId = await seedConversationWithHistory(companyId, userId);
      const followUp = await measure(() =>
        interactor().invoke({
          clientRequestId: randomUUID(),
          conversationId,
          text: "Continue",
          retry: false,
        }),
      );
      expect(followUp.result.ok && followUp.result.data.disposition).toBe("run");
      samples.followUp.push(followUp);
    }

    const summary = Object.fromEntries(
      Object.entries(samples).map(([name, runs]) => [
        name,
        {
          statements: runs[0]?.statements,
          transactions: runs[0]?.transactions,
          companyLocks: runs[0]?.companyLocks,
          medianMs: Math.round(median(runs.map((run) => run.elapsedMs)) * 10) / 10,
        },
      ]),
    );
    const reportPath = process.env.AGENT_SEND_ROUND_TRIPS_REPORT;
    if (reportPath) {
      writeFileSync(
        reportPath,
        JSON.stringify(
          {
            summary,
            firstTurnLog: samples.first[0]?.log,
            followUpLog: samples.followUp[0]?.log,
          },
          null,
          2,
        ),
      );
    }

    for (const runs of Object.values(samples)) {
      expect(median(runs.map((run) => run.statements))).toBeLessThanOrEqual(28);
      expect(median(runs.map((run) => run.transactions))).toBeLessThanOrEqual(3);
      expect(median(runs.map((run) => run.companyLocks))).toBe(2);
      expect(Math.min(...runs.map((run) => run.companyLocks))).toBe(2);
    }
  });
});
