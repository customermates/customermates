import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

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
  const databaseName = `routine_owner_${randomUUID().replaceAll("-", "")}`;
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

/**
 * A routine outlives its owner. These assert the database-level guarantee, which cannot live in
 * application code: on the delete path the conversation and turn have already cascaded away by the
 * time anything in TypeScript could run.
 */
describeDatabase("a routine whose owner becomes unavailable", { timeout: 120_000 }, () => {
  it("pauses the routine, settles its runs, and survives the owner being deleted", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const companyId = randomUUID();
      const ownerId = randomUUID();
      const leaverId = randomUUID();
      const routineId = randomUUID();
      const leaverRoutineId = randomUUID();
      const blockedRunId = randomUUID();
      const settledRunId = randomUUID();
      const leaverRunId = randomUUID();
      const conversationId = randomUUID();
      const turnRequestId = randomUUID();

      await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, NOW())`, [companyId]);

      for (const [id, first, status] of [
        [ownerId, "Ada", "active"],
        [leaverId, "Grace", "active"],
      ] as const) {
        await client.query(
          `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
           VALUES ($1, $2, $3, 'Lovelace', $4, $5, NOW())`,
          [id, `owner-${id}@example.invalid`, first, companyId, status],
        );
      }

      const insertRoutine = (id: string, owner: string, lastStatus: string | null, lastRunAt: string | null) =>
        client.query(
          `INSERT INTO "Routine"
             ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "triggerEvents",
              "nextRunAt", "lastRunStatus", "lastRunAt", "updatedAt")
           VALUES ($1, $2, $3, 'Nightly digest', 'Summarise', TRUE, 'event', ARRAY['contact.updated'],
                   NOW(), $4::"RoutineRunStatus", $5::timestamptz, NOW())`,
          [id, companyId, owner, lastStatus, lastRunAt],
        );

      await insertRoutine(routineId, ownerId, "partial", "2100-01-02T03:04:05.000Z");
      await insertRoutine(leaverRoutineId, leaverId, null, null);

      const insertRun = (id: string, routine: string, executor: string, name: string, status: string) =>
        client.query(
          `INSERT INTO "RoutineRun"
             ("id", "companyId", "routineId", "executedByUserId", "executedByName", "status", "triggerKind",
              "scheduledFor", "startedAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6::"RoutineRunStatus", 'event', NOW(), NOW(), NOW())`,
          [id, companyId, routine, executor, name, status],
        );

      await insertRun(blockedRunId, routineId, ownerId, "Ada Lovelace", "running");
      await insertRun(settledRunId, routineId, ownerId, "Ada Lovelace", "running");
      await insertRun(leaverRunId, leaverRoutineId, leaverId, "Grace Lovelace", "queued");

      // A run whose turn committed just before the owner was removed keeps its real outcome.
      await client.query(
        `INSERT INTO "AgentConversation" ("id", "companyId", "userId", "origin", "updatedAt")
         VALUES ($1, $2, $3, 'routine', NOW())`,
        [conversationId, companyId, ownerId],
      );
      await client.query(
        `INSERT INTO "AgentTurnRequest"
           ("id", "companyId", "userId", "conversationId", "clientRequestId", "text", "status", "runId",
            "userMessageId", "terminalCode", "terminalAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 'Run it', 'completed', $6, $7, 'completed', NOW(), NOW())`,
        [turnRequestId, companyId, ownerId, conversationId, settledRunId, randomUUID(), randomUUID()],
      );
      await client.query(`UPDATE "RoutineRun" SET "turnRequestId" = $1, "conversationId" = $2 WHERE "id" = $3`, [
        turnRequestId,
        conversationId,
        settledRunId,
      ]);
      await client.query(
        `INSERT INTO "AgentMessage" ("id", "conversationId", "companyId", "turnRequestId", "role", "parts")
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
      await client.query(
        `INSERT INTO "AgentUsageEvent"
           ("id", "companyId", "userId", "turnRequestId", "state", "reservedCredits", "chargedCredits",
            "planSnapshot", "subscriptionStatusSnapshot", "allowanceCreditsSnapshot", "periodStart", "periodEnd",
            "settledAt")
         VALUES ($1, $2, $3, $4, 'settled', 5, 5, 'pro', 'active', 100, NOW() - INTERVAL '1 day', NOW(), NOW())`,
        [randomUUID(), companyId, ownerId, turnRequestId],
      );

      // Losing active status is enough; the user need not be deleted.
      await client.query(`UPDATE "User" SET "status" = 'inactive' WHERE "id" = $1`, [leaverId]);

      const pausedRoutine = await client.query(
        `SELECT "enabled", "nextRunAt", "disabledReason" FROM "Routine" WHERE "id" = $1`,
        [leaverRoutineId],
      );

      expect(pausedRoutine.rows[0]).toEqual({ enabled: false, nextRunAt: null, disabledReason: "ownerUnavailable" });

      const pausedRun = await client.query(`SELECT "status", "error" FROM "RoutineRun" WHERE "id" = $1`, [leaverRunId]);

      expect(pausedRun.rows[0]).toEqual({ status: "blocked", error: "ownerUnavailable" });

      // Coming back does not silently resume work the owner may no longer expect.
      await client.query(`UPDATE "User" SET "status" = 'active' WHERE "id" = $1`, [leaverId]);

      const afterReactivation = await client.query(`SELECT "enabled" FROM "Routine" WHERE "id" = $1`, [
        leaverRoutineId,
      ]);

      expect(afterReactivation.rows[0]).toEqual({ enabled: false });

      await client.query(`DELETE FROM "User" WHERE "id" = $1`, [ownerId]);

      const routine = await client.query(
        `SELECT "ownerUserId", "enabled", "disabledReason", "lastRunStatus" FROM "Routine" WHERE "id" = $1`,
        [routineId],
      );

      // The routine survives its owner, and a better earlier outcome is not regressed by the settle.
      expect(routine.rows[0]).toEqual({
        ownerUserId: null,
        enabled: false,
        disabledReason: "ownerUnavailable",
        lastRunStatus: "partial",
      });

      const blocked = await client.query(
        `SELECT "status", "error", "executedByUserId", "executedByName" FROM "RoutineRun" WHERE "id" = $1`,
        [blockedRunId],
      );

      expect(blocked.rows[0]).toEqual({
        status: "blocked",
        error: "ownerUnavailable",
        executedByUserId: ownerId,
        executedByName: "Ada Lovelace",
      });

      const settled = await client.query(
        `SELECT "status", "terminalCode", "chargedCredits", "summary", "error" FROM "RoutineRun" WHERE "id" = $1`,
        [settledRunId],
      );

      expect(settled.rows[0]).toEqual({
        status: "succeeded",
        terminalCode: "completed",
        chargedCredits: 5,
        summary: "Finished the CRM digest safely.",
        error: null,
      });
    });
  });

  it("refuses to leave an enabled routine without an owner", async () => {
    await withTemporaryDatabase(requiredDatabaseUrl(), async (client) => {
      await applyMigrations(client, migrationNames());

      const companyId = randomUUID();
      await client.query(`INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, NOW())`, [companyId]);

      await expect(
        client.query(
          `INSERT INTO "Routine"
             ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "triggerEvents", "updatedAt")
           VALUES ($1, $2, NULL, 'Ownerless', 'Summarise', TRUE, 'event', ARRAY['contact.updated'], NOW())`,
          [randomUUID(), companyId],
        ),
      ).rejects.toThrow(/Routine_enabled_requires_owner/);
    });
  });
});
