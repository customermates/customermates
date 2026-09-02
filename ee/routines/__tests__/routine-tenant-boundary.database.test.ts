import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaRoutineRepo } from "../prisma-routine.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PrismaRoutineRepo tenant boundaries", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ownerId = randomUUID();
  const teammateId = randomUUID();
  const routineId = randomUUID();
  const otherRoutineId = randomUUID();
  const runId = randomUUID();
  const conversationId = randomUUID();

  const tenant = (id: string, company = companyId): TenantUser => createMockUser({ id, companyId: company });

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, otherCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);

    for (const [id, company] of [
      [ownerId, companyId],
      [teammateId, companyId],
    ] as const) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
        [id, `routine-${id}@example.invalid`, "Routine", "Tester", company],
      );
    }

    for (const [id, company] of [
      [routineId, companyId],
      [otherRoutineId, otherCompanyId],
    ] as const) {
      await client.query(
        'INSERT INTO "Routine" ("id", "companyId", "ownerUserId", "name", "prompt", "triggerKind", "triggerEvents", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
        [id, company, ownerId, "Boundary routine", "Do something", "event", ["contact.updated"]],
      );
    }

    await client.query(
      'INSERT INTO "AgentConversation" ("id", "companyId", "userId", "origin", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [conversationId, companyId, ownerId, "routine"],
    );
    await client.query(
      'INSERT INTO "AgentMessage" ("id", "conversationId", "companyId", "role", "parts") VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), conversationId, companyId, "assistant", JSON.stringify([{ type: "text", text: "secret reply" }])],
    );
    await client.query(
      'INSERT INTO "RoutineRun" ("id", "companyId", "routineId", "conversationId", "status", "triggerKind", "scheduledFor", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [runId, companyId, routineId, conversationId, "succeeded", "event"],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "RoutineRun" WHERE "companyId" = ANY($1)', [[companyId, otherCompanyId]]);
    await client.query('DELETE FROM "AgentMessage" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "AgentConversation" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Routine" WHERE "companyId" = ANY($1)', [[companyId, otherCompanyId]]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, otherCompanyId]]);
    await client.end();
  });

  it("prunes only the deleted field's filter, and only inside the named company", async () => {
    const deadField = randomUUID();
    const liveFilter = { field: "assignedUserIds", operator: "isNotNull" };
    const filters = JSON.stringify([{ field: deadField, operator: "isNotNull" }, liveFilter]);

    for (const id of [routineId, otherRoutineId])
      await client.query('UPDATE "Routine" SET "triggerFilters" = $1 WHERE "id" = $2', [filters, id]);

    const pruned = await runWithTenant(tenant(ownerId), () =>
      new PrismaRoutineRepo().pruneRoutineFiltersForFieldUnscoped(companyId, deadField),
    );

    expect(pruned).toBe(1);

    const mine = await client.query('SELECT "triggerFilters" FROM "Routine" WHERE "id" = $1', [routineId]);
    expect(mine.rows[0].triggerFilters).toEqual([liveFilter]);

    const theirs = await client.query('SELECT "triggerFilters" FROM "Routine" WHERE "id" = $1', [otherRoutineId]);
    expect(theirs.rows[0].triggerFilters).toHaveLength(2);
  });

  it("hides another company's routine from a routine lookup", async () => {
    await expect(
      runWithTenant(tenant(ownerId), () => new PrismaRoutineRepo().getRoutineByIdOrThrow(otherRoutineId)),
    ).rejects.toThrow();
  });

  it("lists only the caller's company when finding event routines", async () => {
    const routines = await runWithTenant(tenant(ownerId), () =>
      new PrismaRoutineRepo().findEventRoutinesUnscoped(companyId, "contact.updated"),
    );

    expect(routines.map((routine) => routine.id)).toEqual([routineId]);
  });

  it("refuses to admit an event run for a routine outside the named company", async () => {
    const admitted = await runWithTenant(tenant(ownerId), () =>
      new PrismaRoutineRepo().admitEventRoutineRunsUnscoped({
        companyId,
        event: "contact.updated",
        entityId: null,
        routineIds: [otherRoutineId],
        now: new Date(),
      }),
    );

    expect(admitted).toEqual([]);
  });
});
