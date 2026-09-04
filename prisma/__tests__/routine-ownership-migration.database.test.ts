import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const MIGRATION = "20260904113000_routine_ownership";
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

async function withTemporaryDatabase<T>(databaseUrl: string, fn: (client: Client) => Promise<T>) {
  const databaseName = `routine_ownership_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: databaseUrl });
  let database: Client | undefined;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    database = new Client({ connectionString: isolatedUrl.toString() });
    await database.connect();
    return await fn(database);
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

describeDatabase("routine ownership migration", { timeout: 120_000 }, () => {
  it("backfills the executor and preserves a paused routine and run when its owner is deleted", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      const names = migrationNames();
      const cut = names.indexOf(MIGRATION);
      expect(cut).toBeGreaterThan(0);
      await applyMigrations(client, names.slice(0, cut));

      const companyId = randomUUID();
      const ownerId = randomUUID();
      const inactiveOwnerId = randomUUID();
      const routineId = randomUUID();
      const inactiveRoutineId = randomUUID();
      const runId = randomUUID();
      const inactiveRunId = randomUUID();
      const completedRunId = randomUUID();
      const conversationId = randomUUID();
      const turnRequestId = randomUUID();
      const firstUsageEventId = randomUUID();
      const secondUsageEventId = randomUUID();
      await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, NOW())`, [companyId]);
      await client.query(
        `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
         VALUES ($1, $2, 'Ada', 'Lovelace', $3, 'active', NOW())`,
        [ownerId, `routine-owner-${ownerId}@example.invalid`, companyId],
      );
      await client.query(
        `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
         VALUES ($1, $2, 'Former', 'Owner', $3, 'inactive', NOW())`,
        [inactiveOwnerId, `routine-owner-${inactiveOwnerId}@example.invalid`, companyId],
      );
      await client.query(
        `INSERT INTO "Routine"
           ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "triggerEvents",
            "lastRunStatus", "lastRunAt", "updatedAt")
         VALUES ($1, $2, $3, 'Legacy routine', 'Summarise', TRUE, 'event', ARRAY['contact.updated'], 'partial',
                 '2100-01-02T03:04:05.000Z', NOW())`,
        [routineId, companyId, ownerId],
      );
      await client.query(
        `INSERT INTO "Routine"
           ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "triggerEvents",
            "nextRunAt", "updatedAt")
         VALUES ($1, $2, $3, 'Inactive owner routine', 'Summarise', TRUE, 'event', ARRAY['contact.updated'],
                 NOW(), NOW())`,
        [inactiveRoutineId, companyId, inactiveOwnerId],
      );
      await client.query(
        `INSERT INTO "RoutineRun" ("id", "companyId", "routineId", "status", "triggerKind", "scheduledFor", "startedAt", "updatedAt")
         VALUES ($1, $2, $3, 'running', 'event', NOW(), NOW(), NOW())`,
        [runId, companyId, routineId],
      );
      await client.query(
        `INSERT INTO "RoutineRun" ("id", "companyId", "routineId", "status", "triggerKind", "scheduledFor", "startedAt", "updatedAt")
         VALUES ($1, $2, $3, 'running', 'event', NOW(), NOW(), NOW())`,
        [completedRunId, companyId, routineId],
      );
      await client.query(
        `INSERT INTO "RoutineRun" ("id", "companyId", "routineId", "status", "triggerKind", "scheduledFor", "updatedAt")
         VALUES ($1, $2, $3, 'queued', 'event', NOW(), NOW())`,
        [inactiveRunId, companyId, inactiveRoutineId],
      );
      await client.query(
        `INSERT INTO "AgentConversation" ("id", "companyId", "userId", "origin", "updatedAt")
         VALUES ($1, $2, $3, 'routine', NOW())`,
        [conversationId, companyId, ownerId],
      );
      await client.query(
        `INSERT INTO "AgentTurnRequest"
           ("id", "companyId", "userId", "conversationId", "clientRequestId", "text", "status", "runId",
            "userMessageId", "terminalCode", "terminalAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'Run the routine', 'completed', $6, $7, 'completed', NOW(), NOW())`,
        [turnRequestId, companyId, ownerId, conversationId, completedRunId, randomUUID(), randomUUID()],
      );
      await client.query(
        `INSERT INTO "AgentMessage"
           ("id", "conversationId", "companyId", "turnRequestId", "role", "parts")
         VALUES ($1, $2, $3, $4, 'assistant', $5::jsonb)`,
        [
          randomUUID(),
          conversationId,
          companyId,
          turnRequestId,
          JSON.stringify([
            { type: "text", text: " Finished   the CRM" },
            { type: "text", text: "digest safely. " },
          ]),
        ],
      );
      for (const [usageEventId, credits] of [
        [firstUsageEventId, 2],
        [secondUsageEventId, 3],
      ] as const) {
        await client.query(
          `INSERT INTO "AgentUsageEvent"
             ("id", "companyId", "userId", "turnRequestId", "state", "reservedCredits", "chargedCredits",
              "planSnapshot", "subscriptionStatusSnapshot", "allowanceCreditsSnapshot", "periodStart", "periodEnd",
              "settledAt")
           VALUES ($1, $2, $3, $4, 'settled', $5, $5, 'pro', 'active', 100, NOW() - INTERVAL '1 day',
                   NOW() + INTERVAL '1 day', NOW())`,
          [usageEventId, companyId, ownerId, turnRequestId, credits],
        );
      }

      await applyMigrations(client, names.slice(cut));

      const backfilled = await client.query<{
        executedByUserId: string;
        executedByName: string;
      }>(`SELECT "executedByUserId", "executedByName" FROM "RoutineRun" WHERE "id" = $1`, [runId]);
      expect(backfilled.rows[0]).toEqual({
        executedByUserId: ownerId,
        executedByName: "Ada Lovelace",
      });

      const preexistingInactive = await client.query<{
        enabled: boolean;
        nextRunAt: Date | null;
        disabledReason: string | null;
        lastRunStatus: string | null;
        lastRunAt: Date | null;
      }>(
        `SELECT "enabled", "nextRunAt", "disabledReason", "lastRunStatus", "lastRunAt"
         FROM "Routine" WHERE "id" = $1`,
        [inactiveRoutineId],
      );
      expect(preexistingInactive.rows[0]).toEqual({
        enabled: false,
        nextRunAt: null,
        disabledReason: "ownerUnavailable",
        lastRunStatus: "blocked",
        lastRunAt: expect.any(Date),
      });
      const preexistingInactiveRun = await client.query<{ status: string; error: string | null }>(
        `SELECT "status", "error" FROM "RoutineRun" WHERE "id" = $1`,
        [inactiveRunId],
      );
      expect(preexistingInactiveRun.rows[0]).toEqual({ status: "blocked", error: "ownerUnavailable" });
      await client.query(`UPDATE "User" SET "status" = 'active' WHERE "id" = $1`, [inactiveOwnerId]);
      const afterReactivation = await client.query<{ enabled: boolean }>(
        `SELECT "enabled" FROM "Routine" WHERE "id" = $1`,
        [inactiveRoutineId],
      );
      expect(afterReactivation.rows[0]).toEqual({ enabled: false });
      const summaryBeforeDelete = await client.query<{ lastRunStatus: string | null; lastRunAt: Date | null }>(
        `SELECT "lastRunStatus", "lastRunAt" FROM "Routine" WHERE "id" = $1`,
        [routineId],
      );
      expect(summaryBeforeDelete.rows[0]).toEqual({ lastRunStatus: "partial", lastRunAt: expect.any(Date) });

      await client.query(`DELETE FROM "User" WHERE "id" = $1`, [ownerId]);

      const routine = await client.query<{
        ownerUserId: string | null;
        enabled: boolean;
        nextRunAt: Date | null;
        disabledReason: string | null;
        lastRunStatus: string | null;
        lastRunAt: Date | null;
      }>(
        `SELECT "ownerUserId", "enabled", "nextRunAt", "disabledReason", "lastRunStatus", "lastRunAt"
         FROM "Routine" WHERE "id" = $1`,
        [routineId],
      );
      expect(routine.rows[0]).toEqual({
        ownerUserId: null,
        enabled: false,
        nextRunAt: null,
        disabledReason: "ownerUnavailable",
        lastRunStatus: "partial",
        lastRunAt: summaryBeforeDelete.rows[0].lastRunAt,
      });

      const run = await client.query<{
        executedByUserId: string;
        executedByName: string;
        status: string;
        error: string | null;
      }>(`SELECT "executedByUserId", "executedByName", "status", "error" FROM "RoutineRun" WHERE "id" = $1`, [runId]);
      expect(run.rows[0]).toEqual({
        executedByUserId: ownerId,
        executedByName: "Ada Lovelace",
        status: "blocked",
        error: "ownerUnavailable",
      });

      const completedRun = await client.query<{
        executedByUserId: string;
        executedByName: string;
        conversationId: string | null;
        turnRequestId: string | null;
        status: string;
        terminalCode: string | null;
        chargedCredits: number;
        summary: string | null;
        error: string | null;
      }>(
        `SELECT "executedByUserId", "executedByName", "conversationId", "turnRequestId", "status", "terminalCode",
                "chargedCredits", "summary", "error"
         FROM "RoutineRun" WHERE "id" = $1`,
        [completedRunId],
      );
      expect(completedRun.rows[0]).toEqual({
        executedByUserId: ownerId,
        executedByName: "Ada Lovelace",
        conversationId: null,
        turnRequestId,
        status: "succeeded",
        terminalCode: "completed",
        chargedCredits: 5,
        summary: "Finished the CRM digest safely.",
        error: null,
      });

      const deletedTranscript = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "AgentTurnRequest" WHERE "id" = $1`,
        [turnRequestId],
      );
      expect(deletedTranscript.rows[0]).toEqual({ count: "0" });

      const retainedUsage = await client.query<{
        state: string;
        chargedCredits: number;
        turnRequestId: string | null;
      }>(
        `SELECT "state", "chargedCredits", "turnRequestId"
         FROM "AgentUsageEvent" WHERE "id" IN ($1, $2) ORDER BY "chargedCredits"`,
        [firstUsageEventId, secondUsageEventId],
      );
      expect(retainedUsage.rows).toEqual([
        { state: "settled", chargedCredits: 2, turnRequestId: null },
        { state: "settled", chargedCredits: 3, turnRequestId: null },
      ]);
    });
  });
});
