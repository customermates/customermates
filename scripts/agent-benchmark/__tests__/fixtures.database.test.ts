import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { agentCreditPeriodForAnchor } from "@/ee/agent-chat/agent-credit-policy";
import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { BENCHMARK_CASES, cleanupBenchmarkFixture, createBenchmarkDb, scoreBenchmarkCase, seedBenchmarkCase, type BenchmarkDb, type Fixture } from "../fixtures";

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    env: {
      ...actual.env,
      APP_MODE: "cloud",
      HOSTED_AI_OPERATOR_CONTROLS_ENABLED: false,
    },
  };
});

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("agent benchmark fixtures and oracle", () => {
  let db: BenchmarkDb;
  const fixtures: Fixture[] = [];

  beforeAll(async () => {
    db = await createBenchmarkDb(databaseUrl!, "http://localhost:4107");
  });

  afterAll(async () => {
    for (const fixture of fixtures) await cleanupBenchmarkFixture(db, fixture).catch(() => undefined);
    await db.prisma.$disconnect();
  });

  it("seeds every case against the current schema and refuses to reuse a namespace", async () => {
    const runKey = `selftest:${randomUUID()}`;
    for (const definition of BENCHMARK_CASES) {
      const fixture = await seedBenchmarkCase(db, definition.id, runKey, 12);
      fixtures.push(fixture);
      expect(fixture.before.contact).toBeDefined();
    }
    await expect(seedBenchmarkCase(db, "S1", runKey, 12)).rejects.toThrow(/already exists/);
  }, 180_000);

  it("passes a correct synthetic answer and catches a planted wrong one", async () => {
    const fixture = await seedBenchmarkCase(db, "S1", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const listCall = { name: "list_records", input: { entity: "deal" }, outcome: "ok" as const };
    const correct = await scoreBenchmarkCase(db, fixture, { turns: [{ text: "Sofia Rossi has 23 open deals.", tools: [listCall], terminalCode: "completed" }] });
    expect(correct.passed).toBe(true);
    const planted = await scoreBenchmarkCase(db, fixture, { turns: [{ text: "Sofia Rossi has 22 open deals.", tools: [listCall], terminalCode: "completed" }] });
    expect(planted.passed).toBe(false);
    expect(planted.checks.filter((check) => !check.passed).map((check) => check.id)).toEqual(["exact-filtered-count-23"]);
  }, 60_000);

  it("accepts R49 digit and word counts only for the requested entity on each turn", async () => {
    const fixture = await seedBenchmarkCase(db, "R49", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const observed = (contactText: string, organizationText: string) => ({
      turns: [
        { text: contactText, tools: [], terminalCode: "completed" },
        { text: organizationText, tools: [], terminalCode: "completed" },
      ],
    });

    const correct = await scoreBenchmarkCase(
      db,
      fixture,
      observed("There is 1 contact in this workspace.", "One organization is in this workspace."),
    );
    expect(correct.passed).toBe(true);
    expect(correct.checks.find((check) => check.id === "both-counts-reported")?.passed).toBe(true);

    const wrong = await scoreBenchmarkCase(
      db,
      fixture,
      observed("There are 2 contacts and 1 organization in this workspace.", "One contact is in this workspace."),
    );
    expect(wrong.passed).toBe(false);
    expect(wrong.checks.find((check) => check.id === "both-counts-reported")?.passed).toBe(false);
  }, 60_000);

  it("enforces the fixture credit ceiling across reservation extensions", async () => {
    const fixture = await seedBenchmarkCase(
      db,
      "S1",
      `selftest:${randomUUID()}`,
      12,
    );
    fixtures.push(fixture);
    const subscription = await db.prisma.subscription.findUniqueOrThrow({
      where: { companyId: fixture.companyId },
    });
    expect(subscription).toMatchObject({
      status: "active",
      plan: "enterprise",
      enterpriseAgentCreditsPerUser: 12,
    });

    const conversationId = randomUUID();
    const turnRequestId = randomUUID();
    const period = agentCreditPeriodForAnchor(
      subscription.agentCreditAnchorAt!,
      new Date(),
    );
    await db.prisma.agentConversation.create({
      data: {
        id: conversationId,
        companyId: fixture.companyId,
        userId: fixture.actorUserId,
      },
    });
    await db.prisma.agentTurnRequest.create({
      data: {
        id: turnRequestId,
        companyId: fixture.companyId,
        userId: fixture.actorUserId,
        conversationId,
        clientRequestId: randomUUID(),
        text: "Benchmark ceiling probe",
        status: "completed",
        runId: randomUUID(),
        userMessageId: randomUUID(),
        terminalCode: "completed",
        terminalAt: new Date(),
      },
    });
    await db.prisma.agentUsageEvent.create({
      data: {
        companyId: fixture.companyId,
        userId: fixture.actorUserId,
        turnRequestId,
        sessionId: randomUUID(),
        state: "reserved",
        reservedCredits: 1,
        chargedCredits: 0,
        planSnapshot: "enterprise",
        subscriptionStatusSnapshot: "active",
        allowanceCreditsSnapshot: 12,
        periodStart: period.start,
        periodEnd: period.resetAt,
      },
    });

    const repo = new PrismaAgentChatRepo();
    await expect(
      runWithoutTenant(() =>
        repo.extendUsageReservationUnscoped({
          turnRequestId,
          companyId: fixture.companyId,
          userId: fixture.actorUserId,
          requiredCredits: 12,
        }),
      ),
    ).resolves.toEqual({ disposition: "extended", reservedCredits: 12 });
    await expect(
      runWithoutTenant(() =>
        repo.extendUsageReservationUnscoped({
          turnRequestId,
          companyId: fixture.companyId,
          userId: fixture.actorUserId,
          requiredCredits: 13,
        }),
      ),
    ).resolves.toEqual({ disposition: "credit_limit" });

    const reservations = await db.prisma.agentUsageEvent.findMany({
      where: { companyId: fixture.companyId },
      select: { reservedCredits: true },
    });
    expect(reservations).toHaveLength(1);
    expect(
      reservations.every((row) => row.reservedCredits <= 12),
    ).toBe(true);
  }, 60_000);

  it("scores a complex case from its final line and the database state", async () => {
    const fixture = await seedBenchmarkCase(db, "C27", `selftest:${randomUUID()}`, 12);
    fixtures.push(fixture);
    const read = { name: "list_records", input: { entity: "deal" }, outcome: "ok" as const };
    const answer = "Alpha Rollout (20,000 vs 5,000), Gamma Pilot (30,000 vs 12,000), Epsilon Platform (50,000 vs 10,000) and Zeta Support (6,000 vs 0) are below half.\nRESULT deals=4 gapEur=79000";
    const correct = await scoreBenchmarkCase(db, fixture, { turns: [{ text: answer, tools: [read], terminalCode: "completed" }] });
    expect(correct.passed).toBe(true);
    const wrong = await scoreBenchmarkCase(db, fixture, { turns: [{ text: answer.replace("79000", "73000"), tools: [read], terminalCode: "completed" }] });
    expect(wrong.checks.find((check) => check.id === "gap-79000")?.passed).toBe(false);
  }, 60_000);

});
