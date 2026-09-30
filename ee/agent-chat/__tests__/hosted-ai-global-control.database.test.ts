import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Prisma } from "@/generated/prisma";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const sourceDatabaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = sourceDatabaseUrl ? describe : describe.skip;
const databaseName = `cus126_global_control_${randomUUID().replaceAll("-", "")}`;
let adminClient: Client | null = null;
let isolatedDatabaseUrl: string | null = null;

async function createIsolatedDatabase(sourceUrl: string): Promise<string> {
  const admin = new Client({ connectionString: sourceUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  adminClient = admin;

  const isolatedUrl = new URL(sourceUrl);
  isolatedUrl.pathname = `/${databaseName}`;
  const client = new Client({ connectionString: isolatedUrl.toString() });
  await client.connect();
  try {
    const migrationsRoot = join(process.cwd(), "prisma/migrations");
    const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations)
      await client.query(readFileSync(join(migrationsRoot, migration, "migration.sql"), "utf8"));
  } finally {
    await client.end();
  }

  return isolatedUrl.toString();
}

if (sourceDatabaseUrl) {
  isolatedDatabaseUrl = await createIsolatedDatabase(sourceDatabaseUrl);
  process.env.DATABASE_URL = isolatedDatabaseUrl;
  delete (globalThis as { prisma?: unknown }).prisma;
}

const hostedAiConfig = vi.hoisted(() => ({
  paused: false,
  cap: null as bigint | null,
}));

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    get DATABASE_URL() {
      return process.env.DATABASE_URL;
    },
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
    get HOSTED_AI_PROVIDER_WORK_PAUSED() {
      return hostedAiConfig.paused;
    },
    get HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS() {
      return hostedAiConfig.cap;
    },
    NODE_ENV: "test",
  },
}));

const { PrismaAgentChatRepo } = await import("../prisma-agent-chat.repository");
const { AGENT_CREDIT_MICROCENTS } = await import("../agent-credit-policy");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

type Seat = { companyId: string; userId: string };

const seats: Seat[] = [];
const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
const periodEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));

async function seedSeat(): Promise<Seat> {
  const companyId = randomUUID();
  const userId = randomUUID();
  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    await prisma.subscription.create({
      data: {
        companyId,
        status: "active",
        plan: "starter",
        agentCreditAnchorAt: periodStart,
      },
    });
    await prisma.user.create({
      data: {
        id: userId,
        companyId,
        email: `global-cap-${userId}@example.invalid`,
        firstName: "Global",
        lastName: "Cap",
        status: "active",
        agentCreditActivatedAt: periodStart,
      },
    });
  });
  const seat = { companyId, userId };
  seats.push(seat);
  return seat;
}

function configureControl(args: { paused: boolean; cap: bigint | null }) {
  hostedAiConfig.paused = args.paused;
  hostedAiConfig.cap = args.cap;
}

function reserve(repo: InstanceType<typeof PrismaAgentChatRepo>, seat: Seat, credits: number) {
  return runWithoutTenant(() =>
    repo.reserveUsageEventUnscoped({
      id: randomUUID(),
      companyId: seat.companyId,
      userId: seat.userId,
      sessionId: randomUUID(),
      reservedMicrocents: credits * AGENT_CREDIT_MICROCENTS,
      planSnapshot: "starter",
      subscriptionStatusSnapshot: "active",
      allowanceMicrocentsSnapshot: 200 * AGENT_CREDIT_MICROCENTS,
      periodStart,
      periodEnd,
    }),
  );
}

function withAdmissionSnapshotBarrier(
  transaction: Prisma.TransactionClient,
  commitTransition: () => Promise<void>,
): Prisma.TransactionClient {
  let rawQueryCount = 0;

  return new Proxy(transaction, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "$queryRaw" && typeof value === "function") {
        return async (...args: unknown[]) => {
          rawQueryCount += 1;
          if (rawQueryCount === 1) await commitTransition();
          return Reflect.apply(value, target, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

beforeAll(async () => {
  if (!isolatedDatabaseUrl) return;
  await seedSeat();
  await seedSeat();
});

beforeEach(async () => {
  if (!isolatedDatabaseUrl) return;
  await runWithoutTenant(() => prisma.agentUsageEvent.deleteMany());
  await runWithoutTenant(() => prisma.hostedAiPlatformUsage.deleteMany());
  await prisma.$executeRaw`DELETE FROM "HostedAiPlatformReservation"`;
});

afterAll(async () => {
  if (isolatedDatabaseUrl) await prisma.$disconnect();
  if (adminClient) {
    await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await adminClient.end();
  }
});

describeDatabase(
  "hosted-AI global admission controls against an isolated PostgreSQL database",
  { timeout: 120_000 },
  () => {
    it("fails closed when the finite cap is missing or provider work is paused", async () => {
      const repo = new PrismaAgentChatRepo();

      configureControl({ paused: false, cap: null });
      await expect(reserve(repo, seats[0], 1)).resolves.toBe(false);

      configureControl({
        paused: true,
        cap: 100n * BigInt(AGENT_CREDIT_MICROCENTS),
      });
      await expect(reserve(repo, seats[0], 1)).resolves.toBe(false);

      await expect(
        runWithoutTenant(() => prisma.agentUsageEvent.count({ where: { state: "reserved" } })),
      ).resolves.toBe(0);
    });

    it("serializes tenants so settled spend plus reservations never exceed the global cap", async () => {
      const repo = new PrismaAgentChatRepo();
      const settledCredits = 2;
      const competingReservationCredits = 3;
      configureControl({
        paused: false,
        cap: BigInt(settledCredits + competingReservationCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
      });
      await runWithoutTenant(() =>
        prisma.agentUsageEvent.create({
          data: {
            companyId: seats[0].companyId,
            userId: seats[0].userId,
            state: "settled",
            costMicrocents: BigInt(settledCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
            costSource: "measured",
            reservedMicrocents: BigInt(settledCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
            chargedMicrocents: BigInt(settledCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
            planSnapshot: "starter",
            subscriptionStatusSnapshot: "active",
            allowanceMicrocentsSnapshot: 200n * BigInt(AGENT_CREDIT_MICROCENTS),
            allowanceCreditsSnapshot: 200,
            periodStart,
            periodEnd,
            providerStartedAt: new Date(),
            settledAt: new Date(),
          },
        }),
      );

      const outcomes = await Promise.allSettled([
        reserve(repo, seats[0], competingReservationCredits),
        reserve(repo, seats[1], competingReservationCredits),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === "fulfilled" && outcome.value === true)).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled" && outcome.value === false)).toHaveLength(1);
      await expect(
        runWithoutTenant(() =>
          prisma.agentUsageEvent.aggregate({
            where: { state: "reserved" },
            _sum: { reservedMicrocents: true },
          }),
        ),
      ).resolves.toMatchObject({
        _sum: {
          reservedMicrocents: BigInt(competingReservationCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
        },
      });
    });

    it("atomically reserves platform batches, counts in-flight work, and settles once across a month boundary", async () => {
      const repo = new PrismaAgentChatRepo();
      const now = new Date();
      configureControl({ paused: false, cap: 10n });
      const reservePlatform = (amount: number) =>
        repo.reservePlatformUsageUnscoped({
          purpose: "docsIndexing",
          model: "embedding",
          reservedMicrocents: amount,
          now,
        });
      const competing = await Promise.all([reservePlatform(6), reservePlatform(6)]);
      expect(competing.filter(Boolean)).toHaveLength(1);
      const id = competing.find((value) => value !== null);
      if (!id) throw new Error("Expected an admitted reservation");
      expect(await reservePlatform(5)).toBeNull();
      const exact = await reservePlatform(4);
      expect(exact).not.toBeNull();
      if (!exact) throw new Error("Expected exact-cap admission");
      expect(await reservePlatform(1)).toBeNull();
      expect(await reserve(repo, seats[0], 1)).toBe(false);
      await repo.settlePlatformUsageUnscoped({
        reservationId: exact,
        charge: null,
        now,
      });
      const later = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2));
      const settlement = {
        reservationId: id,
        charge: {
          model: "embedding",
          inputTokens: 1,
          costMicrocents: 3,
          costSource: "measured" as const,
        },
        now: later,
      };
      await Promise.all([repo.settlePlatformUsageUnscoped(settlement), repo.settlePlatformUsageUnscoped(settlement)]);
      expect(await prisma.$queryRaw`SELECT "costMicrocents" FROM "HostedAiPlatformUsage"`).toEqual([
        { costMicrocents: 3n },
      ]);
      expect(await prisma.$queryRaw`SELECT "id" FROM "HostedAiPlatformReservation"`).toEqual([]);
      const exhausted = await repo.reservePlatformUsageUnscoped({
        purpose: "docsIndexing",
        model: "embedding",
        reservedMicrocents: 8,
        now: later,
      });
      expect(exhausted).toBeNull();
      expect(
        await repo.reservePlatformUsageUnscoped({
          purpose: "docsIndexing",
          model: "embedding",
          reservedMicrocents: 7,
          now: later,
        }),
      ).not.toBeNull();
    });

    it("settles stale platform holds once, preserves fresh holds, and attributes interrupted spend to its creation month", async () => {
      const repo = new PrismaAgentChatRepo();
      const now = new Date();
      const oldMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 2));
      configureControl({ paused: false, cap: 100n });
      const reserved = await Promise.all(
        [6, 7, 4].map((reservedMicrocents) =>
          repo.reservePlatformUsageUnscoped({
            purpose: "docsIndexing",
            model: "embedding",
            reservedMicrocents,
            now,
          }),
        ),
      );
      const holds = reserved.map((hold) => {
        if (!hold) throw new Error("The platform hold was not admitted.");
        return hold;
      });
      await prisma.$executeRaw`UPDATE "HostedAiPlatformReservation" SET "createdAt" = ${new Date(now.getTime() - 20 * 60_000)} WHERE "id" = ${holds[0]}`;
      await prisma.$executeRaw`UPDATE "HostedAiPlatformReservation" SET "createdAt" = ${oldMonth} WHERE "id" = ${holds[1]}`;
      const args = { reservedBefore: new Date(now.getTime() - 15 * 60_000), now };
      expect(await repo.settleStalePlatformReservationsUnscoped(args)).toBe(2);
      expect(await repo.settleStalePlatformReservationsUnscoped(args)).toBe(0);
      const accrued = await runWithoutTenant(() =>
        prisma.hostedAiPlatformUsage.findMany({ orderBy: { accrualMonth: "asc" } }),
      );
      expect(
        accrued.map(({ accrualMonth, costMicrocents }) => ({
          month: accrualMonth.getUTCMonth(),
          cost: costMicrocents,
        })),
      ).toEqual([
        { month: oldMonth.getUTCMonth(), cost: 7n },
        { month: now.getUTCMonth(), cost: 6n },
      ]);
      const remaining = await prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "HostedAiPlatformReservation"`;
      expect(remaining).toEqual([{ id: holds[2] }]);
      configureControl({ paused: false, cap: 10n });
      expect(
        await repo.reservePlatformUsageUnscoped({
          purpose: "docsIndexing",
          model: "embedding",
          reservedMicrocents: 1,
          now,
        }),
      ).toBeNull();
      await repo.settlePlatformUsageUnscoped({ reservationId: holds[2], charge: null, now });
      expect(
        await repo.reservePlatformUsageUnscoped({
          purpose: "docsIndexing",
          model: "embedding",
          reservedMicrocents: 4,
          now,
        }),
      ).not.toBeNull();
    });

    it("recovers a previous-month platform hold before the next admission", async () => {
      const repo = new PrismaAgentChatRepo();
      const now = new Date();
      configureControl({ paused: false, cap: 10n });
      const hold = await repo.reservePlatformUsageUnscoped({
        purpose: "docsIndexing",
        model: "embedding",
        reservedMicrocents: 10,
        now,
      });
      expect(hold).not.toBeNull();
      const oldMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 2));
      await prisma.$executeRaw`UPDATE "HostedAiPlatformReservation" SET "createdAt" = ${oldMonth} WHERE "id" = ${hold}`;
      expect(
        await repo.reservePlatformUsageUnscoped({
          purpose: "docsIndexing",
          model: "embedding",
          reservedMicrocents: 10,
          now,
        }),
      ).not.toBeNull();
      expect(await runWithoutTenant(() => prisma.hostedAiPlatformUsage.findFirst())).toMatchObject({
        costMicrocents: 10n,
        accrualMonth: new Date(Date.UTC(oldMonth.getUTCFullYear(), oldMonth.getUTCMonth(), 1)),
      });
    });

    it("refunds stale customer retrieval holds without losing attempted provider spend or charging a never-started hold", async () => {
      const repo = new PrismaAgentChatRepo();
      const now = new Date();
      const oldMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 2));
      configureControl({ paused: false, cap: 100n });
      const grant = {
        purpose: "wikiRetrieval" as const,
        companyId: seats[0].companyId,
        userId: seats[0].userId,
        periodStart,
        periodEnd,
        planSnapshot: "starter" as const,
        subscriptionStatusSnapshot: "active" as const,
        allowanceMicrocentsSnapshot: 500 * AGENT_CREDIT_MICROCENTS,
      };
      const holds: string[] = [];
      for (const reservedMicrocents of [6, 7, 8, 4]) {
        const hold = await repo.reserveRetrievalUsageUnscoped({ grant, reservedMicrocents, model: "embedding", now });
        if (!hold) throw new Error("The retrieval hold was not admitted.");
        holds.push(hold);
      }
      const stale = new Date(now.getTime() - 20 * 60_000);
      await runWithoutTenant(() =>
        prisma.agentUsageEvent.updateMany({
          where: { id: { in: [holds[0], holds[2]] } },
          data: { createdAt: stale },
        }),
      );
      await runWithoutTenant(() =>
        prisma.agentUsageEvent.updateMany({
          where: { id: holds[1] },
          data: { createdAt: oldMonth, providerStartedAt: oldMonth },
        }),
      );
      await runWithoutTenant(() =>
        prisma.agentUsageEvent.updateMany({ where: { id: holds[2] }, data: { providerStartedAt: null } }),
      );
      const args = { reservedBefore: new Date(now.getTime() - 15 * 60_000), now };
      expect(await repo.releaseStaleRetrievalReservationsUnscoped(args)).toBe(3);
      expect(await repo.releaseStaleRetrievalReservationsUnscoped(args)).toBe(0);
      const events = await runWithoutTenant(() =>
        prisma.agentUsageEvent.findMany({ orderBy: { reservedMicrocents: "asc" } }),
      );
      expect(events.map(({ state, chargedMicrocents }) => ({ state, chargedMicrocents }))).toEqual([
        { state: "reserved", chargedMicrocents: 0n },
        { state: "released", chargedMicrocents: 0n },
        { state: "released", chargedMicrocents: 0n },
        { state: "released", chargedMicrocents: 0n },
      ]);
      const accrued = await runWithoutTenant(() =>
        prisma.hostedAiPlatformUsage.findMany({ orderBy: { accrualMonth: "asc" } }),
      );
      expect(accrued.map(({ costMicrocents }) => costMicrocents)).toEqual([7n, 6n]);
    });

    it("counts the platform's own documentation embedding spend against the global cap", async () => {
      const repo = new PrismaAgentChatRepo();
      configureControl({
        paused: false,
        cap: 5n * BigInt(AGENT_CREDIT_MICROCENTS),
      });
      const now = new Date();
      const accrue = (credits: number) =>
        runWithoutTenant(() =>
          repo.accruePlatformUsageUnscoped({
            purpose: "docsIndexing",
            charge: {
              model: "google/gemini-embedding-001",
              inputTokens: 100,
              costMicrocents: credits * AGENT_CREDIT_MICROCENTS,
              costSource: "measured",
            },
            now,
          }),
        );

      await accrue(1);
      await accrue(2);
      await expect(
        runWithoutTenant(() =>
          prisma.hostedAiPlatformUsage.findMany({
            select: { purpose: true, costMicrocents: true, inputTokens: true },
          }),
        ),
      ).resolves.toEqual([
        {
          purpose: "docsIndexing",
          costMicrocents: 3n * BigInt(AGENT_CREDIT_MICROCENTS),
          inputTokens: 200,
        },
      ]);
      await expect(reserve(repo, seats[0], 3)).resolves.toBe(false);
      await expect(reserve(repo, seats[0], 2)).resolves.toBe(true);
      await expect(runWithoutTenant(() => repo.admitsHostedAiRetrievalUnscoped(now))).resolves.toBe(true);
      await accrue(1);
      await expect(runWithoutTenant(() => repo.admitsHostedAiRetrievalUnscoped(now))).resolves.toBe(false);
      await expect(
        runWithoutTenant(() =>
          prisma.agentUsageEvent.count({
            where: { state: { in: ["settled", "retained"] } },
          }),
        ),
      ).resolves.toBe(0);
    });

    it("reads a reservation transition through one atomic global-commitment snapshot", async () => {
      const repo = new PrismaAgentChatRepo();
      const committedCredits = 4;
      const transitioningId = randomUUID();
      configureControl({
        paused: false,
        cap: BigInt(committedCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
      });
      await runWithoutTenant(() =>
        prisma.agentUsageEvent.create({
          data: {
            id: transitioningId,
            companyId: seats[0].companyId,
            userId: seats[0].userId,
            state: "reserved",
            reservedMicrocents: BigInt(committedCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
            chargedMicrocents: 0,
            planSnapshot: "starter",
            subscriptionStatusSnapshot: "active",
            allowanceMicrocentsSnapshot: 200n * BigInt(AGENT_CREDIT_MICROCENTS),
            allowanceCreditsSnapshot: 200,
            periodStart,
            periodEnd,
          },
        }),
      );

      const transition = new Client({
        connectionString: isolatedDatabaseUrl as string,
      });
      await transition.connect();
      await transition.query("BEGIN");
      await transition.query(
        `UPDATE "AgentUsageEvent"
         SET "state" = 'settled',
             "costMicrocents" = $1,
             "costSource" = 'measured',
             "chargedMicrocents" = $2,
             "settledAt" = $3
         WHERE "id" = $4`,
        [
          BigInt(committedCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
          BigInt(committedCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
          new Date(),
          transitioningId,
        ],
      );

      let transitionCommitted = false;
      const commitTransition = async () => {
        if (transitionCommitted) return;
        await transition.query("COMMIT");
        transitionCommitted = true;
      };
      const originalTransaction = prisma.$transaction.bind(prisma) as unknown as (
        callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
      ) => Promise<unknown>;
      const transactionSpy = vi.spyOn(prisma, "$transaction");
      transactionSpy.mockImplementationOnce(((callback: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
        originalTransaction((transaction) =>
          callback(withAdmissionSnapshotBarrier(transaction, commitTransition)),
        )) as never);

      try {
        await expect(reserve(repo, seats[1], 1)).resolves.toBe(false);
      } finally {
        transactionSpy.mockRestore();
        if (!transitionCommitted) await transition.query("ROLLBACK");
        await transition.end();
      }

      await expect(
        runWithoutTenant(() =>
          prisma.agentUsageEvent.findUniqueOrThrow({
            where: { id: transitioningId },
          }),
        ),
      ).resolves.toMatchObject({
        state: "settled",
        costMicrocents: BigInt(committedCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
      });
      await expect(
        runWithoutTenant(() => prisma.agentUsageEvent.count({ where: { state: "reserved" } })),
      ).resolves.toBe(0);
    });

    it("keeps retained uncertain-provider exposure committed against the global cap", async () => {
      const retainedCredits = 4;
      configureControl({
        paused: false,
        cap: BigInt(retainedCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
      });
      await runWithoutTenant(() =>
        prisma.agentUsageEvent.create({
          data: {
            companyId: seats[0].companyId,
            userId: seats[0].userId,
            state: "retained",
            costMicrocents: 0,
            costSource: "estimated",
            reservedMicrocents: BigInt(retainedCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
            chargedMicrocents: BigInt(retainedCredits) * BigInt(AGENT_CREDIT_MICROCENTS),
            planSnapshot: "starter",
            subscriptionStatusSnapshot: "active",
            allowanceMicrocentsSnapshot: 200n * BigInt(AGENT_CREDIT_MICROCENTS),
            allowanceCreditsSnapshot: 200,
            periodStart,
            periodEnd,
            providerStartedAt: new Date(),
            settledAt: new Date(),
          },
        }),
      );

      await expect(reserve(new PrismaAgentChatRepo(), seats[1], 1)).resolves.toBe(false);
      await expect(
        runWithoutTenant(() => prisma.agentUsageEvent.count({ where: { state: "retained" } })),
      ).resolves.toBe(1);
    });
  },
);
