import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { PrismaRoutineRepo } from "../prisma-routine.repository";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { runWithTenant } from "@/core/decorators/tenant-context";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("routine run access on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ownerId = randomUUID();
  const teammateId = randomUUID();
  const outsiderId = randomUUID();
  const routineId = randomUUID();
  const runId = randomUUID();

  function user(id: string, company: string, permissions: Array<{ resource: Resource; action: Action }>): TenantUser {
    return { ...createMockUserWithPermissions(permissions), id, companyId: company };
  }

  const READ_ALL = [{ resource: Resource.routines, action: Action.readAll }];
  const READ_OWN = [{ resource: Resource.routines, action: Action.readOwn }];

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, otherCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);

    for (const [id, company] of [
      [ownerId, companyId],
      [teammateId, companyId],
      [outsiderId, otherCompanyId],
    ] as const) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `${id}@example.com`, "Person", "Example", company],
      );
    }

    await client.query(
      `INSERT INTO "Routine" ("id", "companyId", "ownerUserId", "name", "prompt", "triggerKind", "updatedAt")
       VALUES ($1, $2, $3, 'Owner routine', 'Summarise.', 'schedule'::"RoutineTriggerKind", CURRENT_TIMESTAMP)`,
      [routineId, companyId, ownerId],
    );
    await client.query(
      `INSERT INTO "RoutineRun"
         ("id", "companyId", "routineId", "executedByUserId", "executedByName", "status", "triggerKind",
          "summary", "scheduledFor", "updatedAt")
       VALUES ($1, $2, $3, $4, 'Owner', 'succeeded'::"RoutineRunStatus", 'schedule'::"RoutineTriggerKind",
               'Reviewed the private pipeline', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [runId, companyId, routineId, ownerId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "RoutineRun" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Routine" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [[companyId, otherCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, otherCompanyId]]);
    await client.end();
  });

  async function runsFor(viewer: TenantUser) {
    return runWithTenant(viewer, () => new PrismaRoutineRepo().getRoutineRuns(routineId, 10));
  }

  it("lets the owner read their own run history", async () => {
    const { runs } = await runsFor(user(ownerId, companyId, READ_OWN));

    expect(runs.map((run) => run.id)).toEqual([runId]);
  });

  it("lets a teammate with workspace-wide read see it too", async () => {
    const { runs } = await runsFor(user(teammateId, companyId, READ_ALL));

    expect(runs.map((run) => run.id)).toEqual([runId]);
  });

  it("hides another owner's run summaries from a teammate who may only read their own", async () => {
    const { runs } = await runsFor(user(teammateId, companyId, READ_OWN));

    expect(runs).toEqual([]);
  });

  it("hides them from a member with no routines permission at all", async () => {
    const { runs } = await runsFor(user(teammateId, companyId, []));

    expect(runs).toEqual([]);
  });

  it("never leaks across companies, whatever the permission", async () => {
    const { runs } = await runsFor(user(outsiderId, otherCompanyId, READ_ALL));

    expect(runs).toEqual([]);
  });
});
