import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaRoutineRepo } from "../prisma-routine.repository";
import { ReconcileRoutineRunsInteractor } from "../reconcile-routine-runs.interactor";
import { ReleaseOwnerRoutinesInteractor } from "../release-owner-routines.interactor";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("releasing the routines of an unavailable owner", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const ownerId = randomUUID();
  const otherOwnerId = randomUUID();
  const ownedRoutineId = randomUUID();
  const otherRoutineId = randomUUID();
  const queuedRunId = randomUUID();
  const runningRunId = randomUUID();
  const finishedRunId = randomUUID();
  const otherRunId = randomUUID();

  async function insertRoutine(id: string, owner: string) {
    await client.query(
      `INSERT INTO "Routine" ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "nextRunAt", "updatedAt")
       VALUES ($1, $2, $3, 'Routine', 'Summarise.', TRUE, 'schedule'::"RoutineTriggerKind", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, companyId, owner],
    );
  }

  async function insertRun(id: string, routine: string, executor: string, status: string) {
    await client.query(
      `INSERT INTO "RoutineRun"
         ("id", "companyId", "routineId", "executedByUserId", "executedByName", "status", "triggerKind",
          "scheduledFor", "updatedAt")
       VALUES ($1, $2, $3, $4, 'Owner', $5::"RoutineRunStatus", 'schedule'::"RoutineTriggerKind",
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, companyId, routine, executor, status],
    );
  }

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    for (const id of [ownerId, otherOwnerId]) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `${id}@example.com`, "Person", "Example", companyId],
      );
    }

    await insertRoutine(ownedRoutineId, ownerId);
    await insertRoutine(otherRoutineId, otherOwnerId);
    await insertRun(queuedRunId, ownedRoutineId, ownerId, "queued");
    await insertRun(runningRunId, ownedRoutineId, ownerId, "running");
    await insertRun(finishedRunId, ownedRoutineId, ownerId, "succeeded");
    await insertRun(otherRunId, otherRoutineId, otherOwnerId, "queued");

    const repo = new PrismaRoutineRepo();
    await new ReleaseOwnerRoutinesInteractor(repo, new ReconcileRoutineRunsInteractor(repo)).invoke({
      companyId,
      ownerUserId: ownerId,
    });
  });

  afterAll(async () => {
    await client.query('DELETE FROM "RoutineRun" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Routine" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  async function routine(id: string) {
    const { rows } = await client.query(
      'SELECT "enabled", "nextRunAt", "disabledReason" FROM "Routine" WHERE "id" = $1',
      [id],
    );
    return rows[0];
  }

  async function run(id: string) {
    const { rows } = await client.query('SELECT "status", "error" FROM "RoutineRun" WHERE "id" = $1', [id]);
    return rows[0];
  }

  it("disables the owner's routines and records why", async () => {
    expect(await routine(ownedRoutineId)).toEqual({
      enabled: false,
      nextRunAt: null,
      disabledReason: "ownerUnavailable",
    });
  });

  it("blocks the runs that were still queued or running", async () => {
    expect(await run(queuedRunId)).toEqual({ status: "blocked", error: "ownerUnavailable" });
    expect(await run(runningRunId)).toEqual({ status: "blocked", error: "ownerUnavailable" });
  });

  it("leaves a run that already reached a terminal state alone", async () => {
    expect(await run(finishedRunId)).toEqual({ status: "succeeded", error: null });
  });

  it("touches nothing belonging to another owner", async () => {
    expect(await routine(otherRoutineId)).toMatchObject({ enabled: true, disabledReason: null });
    expect(await run(otherRunId)).toEqual({ status: "queued", error: null });
  });
});
