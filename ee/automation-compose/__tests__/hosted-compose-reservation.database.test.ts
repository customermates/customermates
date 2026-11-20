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
const { AGENT_RETRIEVAL_RESERVATION_TTL_MS } = await import("@/ee/agent-chat/agent-credit-policy");
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
        email: `compose-${userId}@example.com`,
        firstName: "Compose",
        lastName: "Seat",
        status: "active",
        agentCreditActivatedAt: anchor,
      },
    }),
  );
  return { companyId, userId };
}

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

describeDatabase("hosted credits of the automation composer", () => {
  it("gives back a reservation whose composer call never settled, as the other drafting calls do", async () => {
    const { companyId, userId } = await seedActiveSeat();
    const repo = new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies());
    const usage = new AgentUsageService(repo);
    const now = new Date();
    const crashedAt = new Date(now.getTime() - AGENT_RETRIEVAL_RESERVATION_TTL_MS - 60_000);
    const usedMicrocents = async () =>
      (await runWithoutTenant(() => repo.getWorkspaceCreditPoolUnscoped(companyId, now)))?.usedMicrocents;
    const rowOf = (id: string) => runWithoutTenant(() => prisma.agentUsageEvent.findUniqueOrThrow({ where: { id } }));

    const grant = await runWithoutTenant(() => usage.prepareRetrieval(userId, crashedAt, "automationCompose"));
    if (!grant) throw new Error("The composer was not admitted");
    const abandoned = await runWithoutTenant(() =>
      usage.reserveRetrieval({ grant, worstCaseMicrocents: 40_000, model: "drafting", now: crashedAt }),
    );
    if (!abandoned) throw new Error("The composer credits were not reserved");
    expect(await rowOf(abandoned.id)).toMatchObject({ state: "reserved", purpose: "automationCompose" });
    expect(await usedMicrocents()).toBe(40_000);

    const released = await runWithoutTenant(() =>
      repo.releaseStaleRetrievalReservationsUnscoped({
        companyId,
        reservedBefore: new Date(now.getTime() - AGENT_RETRIEVAL_RESERVATION_TTL_MS),
        now,
      }),
    );

    expect(released).toBe(1);
    expect(await rowOf(abandoned.id)).toMatchObject({ state: "released", chargedMicrocents: 0n });
    expect(await usedMicrocents()).toBe(0);
  });
});
