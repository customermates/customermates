import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma";
import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

import { createSeedContext, SEED_IDS } from "../seeds/context";
import { seedHostedAiOperatorFixtures, seedLocalHostedAiOperatorAccess } from "../seeds/hosted-ai-operator";
import { seedIdentity } from "../seeds/identity";

const MIGRATION = "20260828120000_hosted_ai_operator_control";
const migrationsRoot = join(process.cwd(), "prisma/migrations");

function migrationNames() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function applyMigrations(client: Client, names: string[]) {
  for (const name of names) await client.query(readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8"));
}

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client, isolatedUrl: string) => Promise<T>) {
  const databaseName = `cus126_migration_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: databaseUrl });
  let database: Client | undefined;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    database = new Client({ connectionString: isolatedUrl.toString() });
    await database.connect();
    return await fn(database, isolatedUrl.toString());
  } finally {
    await database?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
}

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

function requiredDatabaseUrl() {
  if (!databaseUrl) throw new Error("Database tests must be enabled for this test");
  return databaseUrl;
}

describeDatabase("hosted AI operator migration", { timeout: 120_000 }, () => {
  it("applies forward onto the earlier schema and establishes a fail-closed singleton", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      expect(cut).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, cut));

      await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ('co-existing', NOW())`);
      await client.query(
        `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
         VALUES ('u-existing', 'existing@example.invalid', 'Existing', 'User', 'co-existing', 'active', NOW())`,
      );
      await client.query(
        `INSERT INTO "Subscription" ("id", "companyId", "plan", "status", "updatedAt")
         VALUES ('sub-existing', 'co-existing', 'enterprise', 'active', NOW())`,
      );

      await applyMigrations(client, names.slice(cut));

      const user = await client.query<{ isPlatformOperator: boolean }>(
        `SELECT "isPlatformOperator" FROM "User" WHERE "id" = 'u-existing'`,
      );
      expect(user.rows).toEqual([{ isPlatformOperator: false }]);

      const control = await client.query<{
        hostedProviderWorkPaused: boolean;
        monthlySpendCapMicrocents: string | null;
        reason: string;
        updatedByOperatorUserId: string;
        version: number;
      }>(
        `SELECT "hostedProviderWorkPaused", "monthlySpendCapMicrocents", "reason", "version",
                "updatedByOperatorUserId"
           FROM "HostedAiGlobalControl" WHERE "id" = 'global'`,
      );
      expect(control.rows).toEqual([
        {
          hostedProviderWorkPaused: true,
          monthlySpendCapMicrocents: null,
          reason: "Initial fail-closed configuration",
          updatedByOperatorUserId: "system:migration",
          version: 1,
        },
      ]);
    });
  });

  it("carries the bounded-money, singleton and immutable-ledger shape", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const checks = await client.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE contype = 'c'
            AND conrelid IN (
              '"AgentCreditAdjustment"'::regclass,
              '"HostedAiGlobalControl"'::regclass,
              '"OperatorAuditEvent"'::regclass,
              '"Subscription"'::regclass
            )
          ORDER BY conname`,
      );
      expect(checks.rows.map(({ conname }) => conname)).toEqual([
        "AgentCreditAdjustment_actor_id_valid",
        "AgentCreditAdjustment_delta_bounded_nonzero",
        "AgentCreditAdjustment_operation_id_valid",
        "AgentCreditAdjustment_period_ordered",
        "AgentCreditAdjustment_reason_valid",
        "HostedAiGlobalControl_actor_id_valid",
        "HostedAiGlobalControl_cap_nonnegative",
        "HostedAiGlobalControl_reason_valid",
        "HostedAiGlobalControl_singleton",
        "HostedAiGlobalControl_version_positive",
        "OperatorAuditEvent_action_valid",
        "OperatorAuditEvent_actor_id_valid",
        "OperatorAuditEvent_operation_id_valid",
        "OperatorAuditEvent_reason_valid",
        "Subscription_enterprise_agent_credits_valid",
      ]);

      const indexes = await client.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname IN (
              'AgentCreditAdjustment_period_lookup_idx',
              'AgentUsageEvent_state_settledAt_createdAt_idx',
              'OperatorAuditEvent_operationId_key'
            )
          ORDER BY indexname`,
      );
      expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
        "AgentCreditAdjustment_period_lookup_idx",
        "AgentUsageEvent_state_settledAt_createdAt_idx",
        "OperatorAuditEvent_operationId_key",
      ]);
    });
  });

  it("rejects invalid allowances, adjustments, controls and audit records", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());
      await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ('co', NOW())`);
      await client.query(
        `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
         VALUES ('u', 'ordinary@example.invalid', 'Ordinary', 'User', 'co', 'active', NOW())`,
      );

      await expect(
        client.query(
          `INSERT INTO "Subscription"
             ("id", "companyId", "plan", "status", "enterpriseAgentCreditsPerUser", "updatedAt")
           VALUES ('sub', 'co', 'enterprise', 'active', 0, NOW())`,
        ),
      ).rejects.toThrow(/Subscription_enterprise_agent_credits_valid/u);

      const adjustment = (id: string, delta: number, start = "2026-08-01", end = "2026-09-01") =>
        client.query(
          `INSERT INTO "AgentCreditAdjustment"
             ("id", "companyId", "userId", "creditDelta", "periodStart", "periodEnd", "reason",
              "operationId", "createdByOperatorUserId")
           VALUES ($1, 'co', 'u', $2, $3, $4, 'Correction', $1, 'operator')`,
          [id, delta, start, end],
        );
      await expect(adjustment("zero", 0)).rejects.toThrow(/AgentCreditAdjustment_delta_bounded_nonzero/u);
      await expect(adjustment("large", 1_000_001)).rejects.toThrow(/AgentCreditAdjustment_delta_bounded_nonzero/u);
      await expect(adjustment("period", 1, "2026-09-01", "2026-08-01")).rejects.toThrow(
        /AgentCreditAdjustment_period_ordered/u,
      );

      await expect(
        client.query(
          `INSERT INTO "HostedAiGlobalControl"
             ("id", "hostedProviderWorkPaused", "reason", "version", "updatedByOperatorUserId", "updatedAt")
           VALUES ('other', true, 'Invalid singleton', 1, 'operator', NOW())`,
        ),
      ).rejects.toThrow(/HostedAiGlobalControl_singleton/u);
      await expect(
        client.query(`UPDATE "HostedAiGlobalControl" SET "monthlySpendCapMicrocents" = -1 WHERE "id" = 'global'`),
      ).rejects.toThrow(/HostedAiGlobalControl_cap_nonnegative/u);

      await expect(
        client.query(
          `INSERT INTO "OperatorAuditEvent" ("id", "actorUserId", "action", "operationId")
           VALUES ('audit', 'operator', ' ', 'audit-op')`,
        ),
      ).rejects.toThrow(/OperatorAuditEvent_action_valid/u);
    });
  });

  it("converges the real two-company local identity and ledger fixtures across two runs", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client, isolatedUrl) => {
      await applyMigrations(client, migrationNames());
      const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolatedUrl }) });
      const context = createSeedContext(prisma, {
        seedUserEmail: SYNTHETIC_SEED_USER.email,
        sharedUserPassword: SYNTHETIC_SEED_USER.password,
      });
      const now = new Date("2026-08-28T12:00:00.000Z");

      try {
        await seedIdentity(context);
        await seedHostedAiOperatorFixtures(context, now);
        await seedLocalHostedAiOperatorAccess(context);
        await seedIdentity(context);
        await seedHostedAiOperatorFixtures(context, now);
        await seedLocalHostedAiOperatorAccess(context);

        await expect(prisma.company.count()).resolves.toBe(2);
        await expect(prisma.user.count()).resolves.toBe(4);
        await expect(prisma.hostedAiGlobalControl.count()).resolves.toBe(1);
        await expect(prisma.agentUsageEvent.count()).resolves.toBe(3);

        const [operator, ordinary, ordinaryAuth, enterprise, control, usage] = await Promise.all([
          prisma.user.findUniqueOrThrow({ where: { id: SEED_IDS.user } }),
          prisma.user.findUniqueOrThrow({ where: { id: SEED_IDS.hostedAiOrdinaryUser } }),
          prisma.authUser.findUniqueOrThrow({ where: { id: SEED_IDS.hostedAiOrdinaryUser } }),
          prisma.subscription.findUniqueOrThrow({ where: { companyId: SEED_IDS.hostedAiFixtureCompany } }),
          prisma.hostedAiGlobalControl.findUniqueOrThrow({ where: { id: "global" } }),
          prisma.agentUsageEvent.findMany({ orderBy: { id: "asc" } }),
        ]);

        expect(operator.isPlatformOperator).toBe(true);
        expect(ordinary).toMatchObject({ isPlatformOperator: false, status: "active" });
        expect(ordinaryAuth).toMatchObject({ emailVerified: true });
        expect(ordinaryAuth.email).toMatch(/@example\.invalid$/u);
        expect(enterprise).toMatchObject({ enterpriseAgentCreditsPerUser: null, plan: "enterprise" });
        expect(control).toMatchObject({
          hostedProviderWorkPaused: false,
          monthlySpendCapMicrocents: 1_000_000_000n,
          updatedByOperatorUserId: SEED_IDS.user,
          version: 1,
        });
        expect(usage.map(({ state }) => state)).toEqual(["settled", "reserved", "released"]);
      } finally {
        await prisma.$disconnect();
      }
    });
  });
});
