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

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
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

async function configureControl(args: { paused: boolean; cap: bigint | null }) {
  await runWithoutTenant(() =>
    prisma.hostedAiGlobalControl.update({
      where: { id: "global" },
      data: {
        hostedProviderWorkPaused: args.paused,
        monthlySpendCapMicrocents: args.cap,
        reason: "Global admission database test",
        updatedByOperatorUserId: "test:operator",
      },
    }),
  );
}

function reserve(repo: InstanceType<typeof PrismaAgentChatRepo>, seat: Seat, credits: number) {
  return runWithoutTenant(() =>
    repo.reserveUsageEventUnscoped({
      id: randomUUID(),
      companyId: seat.companyId,
      userId: seat.userId,
      sessionId: randomUUID(),
      reservedCredits: credits,
      planSnapshot: "starter",
      subscriptionStatusSnapshot: "active",
      allowanceCreditsSnapshot: 200,
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
  let aggregateCount = 0;
  const usageDelegate = new Proxy(transaction.agentUsageEvent, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "aggregate" && typeof value === "function") {
        return async (...args: unknown[]) => {
          const result = await Reflect.apply(value, target, args);
          aggregateCount += 1;
          if (aggregateCount === 1) await commitTransition();
          return result;
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return new Proxy(transaction, {
    get(target, property) {
      if (property === "agentUsageEvent") return usageDelegate;

      const value = Reflect.get(target, property, target);
      if (property === "$queryRaw" && typeof value === "function") {
        return async (...args: unknown[]) => {
          rawQueryCount += 1;
          if (rawQueryCount === 2) await commitTransition();
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

      await configureControl({ paused: false, cap: null });
      await expect(reserve(repo, seats[0], 1)).rejects.toMatchObject({
        reason: "configuration_unavailable",
      });

      await configureControl({
        paused: true,
        cap: 100n * BigInt(AGENT_CREDIT_MICROCENTS),
      });
      await expect(reserve(repo, seats[0], 1)).rejects.toMatchObject({
        reason: "operator_paused",
      });

      await expect(
        runWithoutTenant(() => prisma.agentUsageEvent.count({ where: { state: "reserved" } })),
      ).resolves.toBe(0);
    });

    it("serializes tenants so settled spend plus reservations never exceed the global cap", async () => {
      const repo = new PrismaAgentChatRepo();
      const settledCredits = 2;
      const competingReservationCredits = 3;
      await configureControl({
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
            reservedCredits: settledCredits,
            chargedCredits: settledCredits,
            planSnapshot: "starter",
            subscriptionStatusSnapshot: "active",
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

      expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find(({ status }) => status === "rejected");
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({ reason: "global_spend_cap" }),
      });
      await expect(
        runWithoutTenant(() =>
          prisma.agentUsageEvent.aggregate({
            where: { state: "reserved" },
            _sum: { reservedCredits: true },
          }),
        ),
      ).resolves.toMatchObject({
        _sum: { reservedCredits: competingReservationCredits },
      });
    });

    it("reads a reservation transition through one atomic global-commitment snapshot", async () => {
      const repo = new PrismaAgentChatRepo();
      const committedCredits = 4;
      const transitioningId = randomUUID();
      await configureControl({
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
            reservedCredits: committedCredits,
            chargedCredits: 0,
            planSnapshot: "starter",
            subscriptionStatusSnapshot: "active",
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
             "chargedCredits" = $2,
             "settledAt" = $3
         WHERE "id" = $4`,
        [BigInt(committedCredits) * BigInt(AGENT_CREDIT_MICROCENTS), committedCredits, new Date(), transitioningId],
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
        await expect(reserve(repo, seats[1], 1)).rejects.toMatchObject({
          reason: "global_spend_cap",
        });
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
      await configureControl({
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
            reservedCredits: retainedCredits,
            chargedCredits: retainedCredits,
            planSnapshot: "starter",
            subscriptionStatusSnapshot: "active",
            allowanceCreditsSnapshot: 200,
            periodStart,
            periodEnd,
            providerStartedAt: new Date(),
            settledAt: new Date(),
          },
        }),
      );

      await expect(reserve(new PrismaAgentChatRepo(), seats[1], 1)).rejects.toMatchObject({
        reason: "global_spend_cap",
      });
      await expect(
        runWithoutTenant(() => prisma.agentUsageEvent.count({ where: { state: "retained" } })),
      ).resolves.toBe(1);
    });
  },
);
