import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
}));

import { runWithoutTenant, runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { DeleteRoutineInteractor } from "../delete-routine.interactor";
import { FailRoutineRunInteractor } from "../fail-routine-run.interactor";
import { PauseRoutineInteractor } from "../pause-routine.interactor";
import { PrismaRoutineRepo } from "../prisma-routine.repository";
import { RoutineLimitExceededError } from "../routine-run-limits";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PrismaRoutineRepo tenant boundaries", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ownerId = randomUUID();
  const teammateId = randomUUID();
  const systemRoleId = randomUUID();
  const memberRoleId = randomUUID();
  const routineId = randomUUID();
  const otherRoutineId = randomUUID();
  const runId = randomUUID();
  const conversationId = randomUUID();

  const tenant = (id: string, company = companyId): TenantUser => createMockUser({ id, companyId: company });

  async function insertRoutine(id: string) {
    await client.query(
      `INSERT INTO "Routine" ("id", "companyId", "ownerUserId", "name", "prompt", "triggerKind", "triggerEvents", "updatedAt")
       VALUES ($1, $2, $3, 'Lifecycle routine', 'Do something', 'event', ARRAY['contact.updated'], CURRENT_TIMESTAMP)`,
      [id, companyId, ownerId],
    );
  }

  async function insertRoutineConversation(id: string) {
    await client.query(
      `INSERT INTO "AgentConversation" ("id", "companyId", "userId", "origin", "updatedAt")
       VALUES ($1, $2, $3, 'routine', CURRENT_TIMESTAMP)`,
      [id, companyId, ownerId],
    );
  }

  async function insertRoutineRun(args: {
    id: string;
    routineId: string;
    conversationId?: string | null;
    status?: string;
    createdAt?: Date;
  }) {
    await client.query(
      `INSERT INTO "RoutineRun"
         ("id", "companyId", "routineId", "executedByUserId", "executedByName", "conversationId", "status",
          "triggerKind", "scheduledFor", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'Routine Tester', $5, $6::"RoutineRunStatus", 'event', CURRENT_TIMESTAMP,
               COALESCE($7, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)`,
      [
        args.id,
        companyId,
        args.routineId,
        ownerId,
        args.conversationId ?? null,
        args.status ?? "succeeded",
        args.createdAt ?? null,
      ],
    );
  }

  async function insertAgentTurn(args: {
    id: string;
    conversationId: string;
    clientRequestId: string;
    status?: string;
  }) {
    await client.query(
      `INSERT INTO "AgentTurnRequest"
         ("id", "companyId", "userId", "conversationId", "clientRequestId", "text", "status", "runId",
          "userMessageId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'Follow up', $6::"AgentTurnStatus", $7, $8, CURRENT_TIMESTAMP)`,
      [
        args.id,
        companyId,
        ownerId,
        args.conversationId,
        args.clientRequestId,
        args.status ?? "running",
        randomUUID(),
        randomUUID(),
      ],
    );
  }

  async function insertRunLease(conversationId: string) {
    await client.query(
      `INSERT INTO "AgentRunLease" ("conversationId", "companyId", "userId", "runId", "expiresAt")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [conversationId, companyId, ownerId, randomUUID()],
    );
  }

  async function insertReservedUsage(turnRequestId: string | null = null) {
    const id = randomUUID();
    await client.query(
      `INSERT INTO "AgentUsageEvent"
         ("id", "companyId", "userId", "turnRequestId", "state", "reservedCredits", "chargedCredits",
          "planSnapshot", "subscriptionStatusSnapshot", "allowanceCreditsSnapshot", "periodStart", "periodEnd")
       VALUES ($1, $2, $3, $4, 'reserved', 5, 0, 'enterprise', 'active', 100,
               CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '1 day')`,
      [id, companyId, ownerId, turnRequestId],
    );

    return id;
  }

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, otherCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);

    await client.query(
      `INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt")
       VALUES ($1, 'Routine system role', true, $3, CURRENT_TIMESTAMP),
              ($2, 'Routine member role', false, $3, CURRENT_TIMESTAMP)`,
      [systemRoleId, memberRoleId, companyId],
    );

    for (const [id, company] of [
      [ownerId, companyId],
      [teammateId, companyId],
    ] as const) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
        [id, `routine-${id}@example.invalid`, "Routine", "Tester", company, "active"],
      );
    }
    await client.query('UPDATE "User" SET "roleId" = $1 WHERE "id" = $2', [systemRoleId, teammateId]);

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
      'INSERT INTO "RoutineRun" ("id", "companyId", "routineId", "executedByUserId", "executedByName", "conversationId", "status", "triggerKind", "scheduledFor", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [runId, companyId, routineId, ownerId, "Routine Tester", conversationId, "succeeded", "event"],
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

  it("detects a routine filter dependency only inside the caller's company without mutating filters", async () => {
    const referencedField = randomUUID();
    const otherCompanyField = randomUUID();
    const liveFilter = { field: "assignedUserIds", operator: "isNotNull" };
    const companyFilters = [{ field: referencedField, operator: "isNotNull" }, liveFilter];
    const otherCompanyFilters = [{ field: otherCompanyField, operator: "isNotNull" }, liveFilter];

    await client.query('UPDATE "Routine" SET "triggerFilters" = $1 WHERE "id" = $2', [
      JSON.stringify(companyFilters),
      routineId,
    ]);
    await client.query('UPDATE "Routine" SET "triggerFilters" = $1 WHERE "id" = $2', [
      JSON.stringify(otherCompanyFilters),
      otherRoutineId,
    ]);

    const [referenced, crossTenantReference] = await runWithTenant(tenant(ownerId), () =>
      Promise.all([
        new PrismaRoutineRepo().hasRoutineFilterReference(referencedField),
        new PrismaRoutineRepo().hasRoutineFilterReference(otherCompanyField),
      ]),
    );

    expect(referenced).toBe(true);
    expect(crossTenantReference).toBe(false);

    const mine = await client.query('SELECT "triggerFilters" FROM "Routine" WHERE "id" = $1', [routineId]);
    expect(mine.rows[0].triggerFilters).toEqual(companyFilters);

    const theirs = await client.query('SELECT "triggerFilters" FROM "Routine" WHERE "id" = $1', [otherRoutineId]);
    expect(theirs.rows[0].triggerFilters).toEqual(otherCompanyFilters);
  });

  it("rejects stale admin pause and delete sessions after the database role or membership is revoked", async () => {
    const staleAdmin = tenant(teammateId);

    await client.query('UPDATE "User" SET "roleId" = $1 WHERE "id" = $2', [memberRoleId, teammateId]);
    const pauseResult = await runWithTenant(staleAdmin, () =>
      new PauseRoutineInteractor(new PrismaRoutineRepo()).invoke({ routineId }),
    );

    await client.query('UPDATE "User" SET "roleId" = $1, "status" = $2 WHERE "id" = $3', [
      systemRoleId,
      "inactive",
      teammateId,
    ]);
    const deleteResult = await runWithTenant(staleAdmin, () =>
      new DeleteRoutineInteractor(new PrismaRoutineRepo()).invoke({
        id: routineId,
      }),
    );

    await client.query('UPDATE "User" SET "status" = $1 WHERE "id" = $2', ["active", teammateId]);

    expect(pauseResult.ok).toBe(false);
    if (!pauseResult.ok) {
      expect(pauseResult.error.issues[0]).toMatchObject({
        params: { error: "routineAdminRequired" },
      });
    }
    expect(deleteResult.ok).toBe(false);
    if (!deleteResult.ok) {
      expect(deleteResult.error.issues[0]).toMatchObject({
        params: { error: "routineAdminRequired" },
      });
    }

    const routine = await client.query('SELECT "id" FROM "Routine" WHERE "id" = $1', [routineId]);
    expect(routine.rowCount).toBe(1);
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

  it("clears schedule-only state when a partial update changes a routine to event", async () => {
    const scheduledRoutineId = randomUUID();
    await client.query(
      `INSERT INTO "Routine"
         ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "cronExpression",
          "timezone", "runOnceAt", "triggerEvents", "nextRunAt", "updatedAt")
       VALUES ($1, $2, $3, 'Scheduled routine', 'Do something', true, 'schedule', '0 9 * * *', 'UTC',
               CURRENT_TIMESTAMP + INTERVAL '2 days', ARRAY[]::TEXT[], CURRENT_TIMESTAMP + INTERVAL '1 day',
               CURRENT_TIMESTAMP)`,
      [scheduledRoutineId, companyId, ownerId],
    );

    await runWithTenant(tenant(ownerId), () =>
      new PrismaRoutineRepo().upsertRoutineOrThrow({
        id: scheduledRoutineId,
        triggerKind: "event",
        triggerEvents: ["deal.updated"],
      }),
    );

    const stored = await client.query<{
      triggerKind: string;
      cronExpression: string | null;
      timezone: string | null;
      runOnceAt: Date | null;
      nextRunAt: Date | null;
    }>(
      `SELECT "triggerKind", "cronExpression", "timezone", "runOnceAt", "nextRunAt"
       FROM "Routine"
       WHERE "id" = $1`,
      [scheduledRoutineId],
    );
    expect(stored.rows[0]).toEqual({
      triggerKind: "event",
      cronExpression: null,
      timezone: null,
      runOnceAt: null,
      nextRunAt: null,
    });
  });

  it("rejects a stale empty-event patch after a concurrent schedule-to-event transition", async () => {
    const raceCompanyId = randomUUID();
    const raceOwnerId = randomUUID();
    const raceRoutineId = randomUUID();
    const blocker = new Client({ connectionString: databaseUrl ?? undefined });
    let firstWrite: Promise<unknown> | null = null;
    let staleWrite: Promise<unknown> | null = null;
    let released = false;

    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [raceCompanyId]);
    await client.query(
      `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
       VALUES ($1, $2, 'Race', 'Owner', $3, 'active', CURRENT_TIMESTAMP)`,
      [raceOwnerId, `routine-${raceOwnerId}@example.invalid`, raceCompanyId],
    );
    await client.query(
      `INSERT INTO "Routine"
         ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "cronExpression",
          "timezone", "triggerEvents", "nextRunAt", "updatedAt")
       VALUES ($1, $2, $3, 'Racing routine', 'Do something', true, 'schedule', '0 9 * * *', 'UTC',
               ARRAY[]::TEXT[], CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP)`,
      [raceRoutineId, raceCompanyId, raceOwnerId],
    );

    const advisoryWaiterCount = async () => {
      const result = await client.query<{ count: string }>(
        `WITH "key" AS (SELECT hashtextextended($1, 0) AS "value")
         SELECT COUNT(*)::TEXT AS "count"
         FROM pg_locks, "key"
         WHERE "locktype" = 'advisory'
           AND "classid" = (("value" >> 32) & 4294967295)::OID
           AND "objid" = ("value" & 4294967295)::OID
           AND "objsubid" = 1
           AND NOT "granted"`,
        [raceCompanyId],
      );
      return Number(result.rows[0].count);
    };
    const waitForWaiters = async (minimum: number, attempts = 0): Promise<void> => {
      if ((await advisoryWaiterCount()) >= minimum) return;
      if (attempts >= 200) throw new Error("Timed out waiting for the routine write lock queue");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return waitForWaiters(minimum, attempts + 1);
    };

    await blocker.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [raceCompanyId]);

      firstWrite = runWithTenant(tenant(raceOwnerId, raceCompanyId), () =>
        new PrismaRoutineRepo().upsertRoutineOrThrow({
          id: raceRoutineId,
          triggerKind: "event",
          triggerEvents: ["deal.updated"],
        }),
      );
      await waitForWaiters(1);

      staleWrite = runWithTenant(tenant(raceOwnerId, raceCompanyId), () =>
        new PrismaRoutineRepo().upsertRoutineOrThrow({
          id: raceRoutineId,
          triggerEvents: [],
        }),
      );
      await waitForWaiters(2);

      await blocker.query("COMMIT");
      released = true;
      const [transition, stalePatch] = await Promise.allSettled([firstWrite, staleWrite]);
      expect(transition.status).toBe("fulfilled");
      expect(stalePatch.status).toBe("rejected");

      const stored = await client.query<{
        triggerKind: string;
        triggerEvents: string[];
      }>('SELECT "triggerKind", "triggerEvents" FROM "Routine" WHERE "id" = $1', [raceRoutineId]);
      expect(stored.rows[0]).toEqual({
        triggerKind: "event",
        triggerEvents: ["deal.updated"],
      });
    } finally {
      if (!released) await blocker.query("ROLLBACK");
      await Promise.allSettled([firstWrite, staleWrite].filter((write): write is Promise<unknown> => write !== null));
      await blocker.end();
      await client.query('DELETE FROM "Routine" WHERE "companyId" = $1', [raceCompanyId]);
      await client.query('DELETE FROM "User" WHERE "companyId" = $1', [raceCompanyId]);
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [raceCompanyId]);
    }
  });

  it("does not sweep an event routine even when corrupted data gives it a due timestamp", async () => {
    const corruptedEventRoutineId = randomUUID();
    const now = new Date();
    await client.query(
      `INSERT INTO "Routine"
         ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "triggerEvents",
          "nextRunAt", "updatedAt")
       VALUES ($1, $2, $3, 'Corrupted event routine', 'Do something', true, 'event', ARRAY['deal.updated'],
               $4, CURRENT_TIMESTAMP)`,
      [corruptedEventRoutineId, companyId, ownerId, new Date(now.getTime() - 60_000)],
    );

    const due = await runWithoutTenant(() => new PrismaRoutineRepo().findDueRoutinesUnscoped(now, 100));

    expect(due.map((routine) => routine.id)).not.toContain(corruptedEventRoutineId);
  });

  it("serializes concurrent creates so a company cannot exceed its routine allowance", async () => {
    const quotaCompanyId = randomUUID();
    const firstOwnerId = randomUUID();
    const secondOwnerId = randomUUID();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [quotaCompanyId]);
    for (const [id, email] of [
      [firstOwnerId, `routine-${firstOwnerId}@example.invalid`],
      [secondOwnerId, `routine-${secondOwnerId}@example.invalid`],
    ] as const) {
      await client.query(
        `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
         VALUES ($1, $2, 'Routine', 'Owner', $3, 'active', CURRENT_TIMESTAMP)`,
        [id, email, quotaCompanyId],
      );
    }

    try {
      const results = await Promise.allSettled(
        [firstOwnerId, secondOwnerId].map((id, index) =>
          runWithTenant(tenant(id, quotaCompanyId), () =>
            new PrismaRoutineRepo().upsertRoutineOrThrow(
              {
                name: `Concurrent routine ${index + 1}`,
                prompt: "Do something",
                triggerKind: "event",
                triggerEvents: ["deal.updated"],
              },
              1,
            ),
          ),
        ),
      );

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(rejected?.reason).toBeInstanceOf(RoutineLimitExceededError);
      const stored = await client.query<{ count: string }>(
        'SELECT COUNT(*)::TEXT AS "count" FROM "Routine" WHERE "companyId" = $1',
        [quotaCompanyId],
      );
      expect(stored.rows[0].count).toBe("1");
    } finally {
      await client.query('DELETE FROM "Routine" WHERE "companyId" = $1', [quotaCompanyId]);
      await client.query('DELETE FROM "User" WHERE "companyId" = $1', [quotaCompanyId]);
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [quotaCompanyId]);
    }
  });

  it("rechecks owner eligibility inside locked routine writes", async () => {
    const eligibilityCompanyId = randomUUID();
    const activeOwnerId = randomUUID();
    const guardedRoutineId = randomUUID();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [
      eligibilityCompanyId,
    ]);
    await client.query(
      `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
       VALUES ($1, $2, 'Routine', 'Owner', $3, 'active', CURRENT_TIMESTAMP)`,
      [activeOwnerId, `routine-${activeOwnerId}@example.invalid`, eligibilityCompanyId],
    );
    await client.query(
      `INSERT INTO "Routine"
         ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "cronExpression",
          "timezone", "triggerEvents", "nextRunAt", "updatedAt")
       VALUES ($1, $2, $3, 'Guarded routine', 'Do something', true, 'schedule', '0 9 * * *', 'UTC',
               ARRAY[]::TEXT[], CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP)`,
      [guardedRoutineId, eligibilityCompanyId, activeOwnerId],
    );

    try {
      const repo = new PrismaRoutineRepo();
      await client.query('UPDATE "User" SET "status" = \'inactive\' WHERE "id" = $1', [activeOwnerId]);
      await expect(
        runWithTenant(tenant(activeOwnerId, eligibilityCompanyId), () =>
          repo.upsertRoutineOrThrow({ id: guardedRoutineId, enabled: true }),
        ),
      ).rejects.toThrow("no longer eligible");
      await expect(
        runWithTenant(tenant(activeOwnerId, eligibilityCompanyId), () =>
          repo.upsertRoutineOrThrow({
            name: "Stale-session create",
            prompt: "Do something",
            triggerKind: "event",
            triggerEvents: ["deal.updated"],
          }),
        ),
      ).rejects.toThrow("no longer eligible");
      await expect(
        runWithTenant(tenant(activeOwnerId, eligibilityCompanyId), () =>
          repo.createManualRoutineRunOrThrow(guardedRoutineId, activeOwnerId, new Date()),
        ),
      ).rejects.toThrow();

      const stored = await client.query<{
        ownerUserId: string;
        enabled: boolean;
      }>('SELECT "ownerUserId", "enabled" FROM "Routine" WHERE "id" = $1', [guardedRoutineId]);
      expect(stored.rows[0]).toEqual({
        ownerUserId: activeOwnerId,
        enabled: false,
      });
    } finally {
      await client.query('DELETE FROM "RoutineRun" WHERE "companyId" = $1', [eligibilityCompanyId]);
      await client.query('DELETE FROM "Routine" WHERE "companyId" = $1', [eligibilityCompanyId]);
      await client.query('DELETE FROM "User" WHERE "companyId" = $1', [eligibilityCompanyId]);
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [eligibilityCompanyId]);
    }
  });

  it("refuses to admit an event run for a routine outside the named company", async () => {
    const admitted = await runWithTenant(tenant(ownerId), () =>
      new PrismaRoutineRepo().admitEventRoutineRunsUnscoped({
        companyId,
        event: "contact.updated",
        entityId: null,
        triggerPayload: null,
        routines: [{ id: otherRoutineId, ownerUserId: ownerId, updatedAt: new Date(0) }],
        now: new Date(),
      }),
    );

    expect(admitted).toEqual([]);
  });

  it("shows a company routine and its owner to another active member", async () => {
    const result = await runWithTenant(tenant(teammateId), () => new PrismaRoutineRepo().getItems({}));
    const visible = result.find((routine) => routine.id === routineId);

    expect(visible).toMatchObject({
      id: routineId,
      ownerUserId: ownerId,
      owner: {
        id: ownerId,
        firstName: "Routine",
        lastName: "Tester",
        status: "active",
      },
    });
  });

  it("atomically starts at most one concurrent run for the same executor", async () => {
    const firstRunId = randomUUID();
    const secondRunId = randomUUID();
    for (const id of [firstRunId, secondRunId]) {
      await client.query(
        `INSERT INTO "RoutineRun"
           ("id", "companyId", "routineId", "executedByUserId", "executedByName", "status", "triggerKind",
            "triggerEvent", "scheduledFor", "updatedAt")
         VALUES ($1, $2, $3, $4, 'Routine Tester', 'queued', 'event', 'contact.updated', CURRENT_TIMESTAMP,
                 CURRENT_TIMESTAMP)`,
        [id, companyId, routineId, ownerId],
      );
    }

    const outcomes = await Promise.all(
      [firstRunId, secondRunId].map((routineRunId) =>
        runWithTenant(tenant(ownerId), () =>
          new PrismaRoutineRepo().claimQueuedRoutineRunForOwnerUnscoped({
            routineRunId,
            executedByUserId: ownerId,
            maxInFlight: 1,
            now: new Date(),
          }),
        ),
      ),
    );

    expect(outcomes.map((outcome) => (typeof outcome === "string" ? outcome : "claimed")).sort()).toEqual([
      "claimed",
      "ownerRunLimit",
    ]);
    const rows = await client.query<{ status: string; error: string | null }>(
      `SELECT "status", "error" FROM "RoutineRun" WHERE "id" = ANY($1) ORDER BY "status"`,
      [[firstRunId, secondRunId]],
    );
    expect(rows.rows).toEqual([
      { status: "running", error: null },
      { status: "skipped", error: "ownerRunLimit" },
    ]);

    await client.query(`DELETE FROM "RoutineRun" WHERE "id" = ANY($1)`, [[firstRunId, secondRunId]]);
  });

  it("settles queued event runs whose trigger configuration no longer matches their snapshot", async () => {
    const staleRoutineId = randomUUID();
    const kindChangedRunId = randomUUID();
    const eventRemovedRunId = randomUUID();
    const fieldChangedRunId = randomUUID();
    const matchingRunId = randomUUID();
    await insertRoutine(staleRoutineId);

    const insertQueuedRun = async (id: string, triggerPayload: object) => {
      await client.query(
        `INSERT INTO "RoutineRun"
           ("id", "companyId", "routineId", "executedByUserId", "executedByName", "status", "triggerKind",
            "triggerEvent", "triggerPayload", "scheduledFor", "updatedAt")
         VALUES ($1, $2, $3, $4, 'Routine Tester', 'queued', 'event', 'contact.updated', $5::jsonb,
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, companyId, staleRoutineId, ownerId, JSON.stringify(triggerPayload)],
      );
    };
    const claim = (routineRunId: string) =>
      runWithTenant(tenant(ownerId), () =>
        new PrismaRoutineRepo().claimQueuedRoutineRunForOwnerUnscoped({
          routineRunId,
          executedByUserId: ownerId,
          maxInFlight: 1,
          now: new Date(),
        }),
      );

    await insertQueuedRun(kindChangedRunId, {
      payload: { changes: { name: {} } },
    });
    await client.query(`UPDATE "Routine" SET "triggerKind" = 'schedule' WHERE "id" = $1`, [staleRoutineId]);
    await expect(claim(kindChangedRunId)).resolves.toBe("triggerChanged");

    await insertQueuedRun(eventRemovedRunId, {
      payload: { changes: { name: {} } },
    });
    await client.query(
      `UPDATE "Routine"
       SET "triggerKind" = 'event', "triggerEvents" = ARRAY['deal.updated'], "changedFields" = ARRAY['name']
       WHERE "id" = $1`,
      [staleRoutineId],
    );
    await expect(claim(eventRemovedRunId)).resolves.toBe("triggerChanged");

    await insertQueuedRun(fieldChangedRunId, {
      payload: { changes: { notes: {} } },
    });
    await client.query(`UPDATE "Routine" SET "triggerEvents" = ARRAY['contact.updated'] WHERE "id" = $1`, [
      staleRoutineId,
    ]);
    await expect(claim(fieldChangedRunId)).resolves.toBe("triggerChanged");

    await insertQueuedRun(matchingRunId, {
      payload: { changes: { name: {} } },
    });
    await expect(claim(matchingRunId)).resolves.toMatchObject({
      routine: { id: staleRoutineId },
    });

    const rows = await client.query<{
      id: string;
      status: string;
      error: string | null;
    }>(`SELECT "id", "status", "error" FROM "RoutineRun" WHERE "id" = ANY($1)`, [
      [kindChangedRunId, eventRemovedRunId, fieldChangedRunId, matchingRunId],
    ]);
    expect(new Map(rows.rows.map((row) => [row.id, { status: row.status, error: row.error }]))).toEqual(
      new Map([
        [kindChangedRunId, { status: "skipped", error: "startAbandoned" }],
        [eventRemovedRunId, { status: "skipped", error: "startAbandoned" }],
        [fieldChangedRunId, { status: "skipped", error: "startAbandoned" }],
        [matchingRunId, { status: "running", error: null }],
      ]),
    );

    await client.query(`DELETE FROM "RoutineRun" WHERE "routineId" = $1`, [staleRoutineId]);
    await client.query(`DELETE FROM "Routine" WHERE "id" = $1`, [staleRoutineId]);
  });

  it("pauses routines and terminally settles work when an owner becomes inactive", async () => {
    const inactiveOwnerId = randomUUID();
    const inactiveRoutineId = randomUUID();
    const queuedRunId = randomUUID();
    const runningRunId = randomUUID();
    await client.query(
      `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
       VALUES ($1, $2, 'Leaving', 'Owner', $3, 'active', CURRENT_TIMESTAMP)`,
      [inactiveOwnerId, `routine-${inactiveOwnerId}@example.invalid`, companyId],
    );
    await client.query(
      `INSERT INTO "Routine" ("id", "companyId", "ownerUserId", "name", "prompt", "enabled", "triggerKind", "triggerEvents", "updatedAt")
       VALUES ($1, $2, $3, 'Owner lifecycle', 'Do something', TRUE, 'event', ARRAY['contact.updated'], CURRENT_TIMESTAMP)`,
      [inactiveRoutineId, companyId, inactiveOwnerId],
    );
    for (const [id, status] of [
      [queuedRunId, "queued"],
      [runningRunId, "running"],
    ] as const) {
      await client.query(
        `INSERT INTO "RoutineRun" ("id", "companyId", "routineId", "executedByUserId", "executedByName", "status", "triggerKind", "scheduledFor", "startedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'Leaving Owner', $5, 'event', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, companyId, inactiveRoutineId, inactiveOwnerId, status],
      );
    }

    await client.query(`UPDATE "User" SET "status" = 'inactive' WHERE "id" = $1`, [inactiveOwnerId]);

    const routine = await client.query<{
      enabled: boolean;
      disabledReason: string | null;
    }>(`SELECT "enabled", "disabledReason" FROM "Routine" WHERE "id" = $1`, [inactiveRoutineId]);
    expect(routine.rows[0]).toEqual({
      enabled: false,
      disabledReason: "ownerUnavailable",
    });
    const runs = await client.query<{ status: string; error: string | null }>(
      `SELECT "status", "error" FROM "RoutineRun" WHERE "id" = ANY($1) ORDER BY "id"`,
      [[queuedRunId, runningRunId]],
    );
    expect(runs.rows).toEqual([
      { status: "blocked", error: "ownerUnavailable" },
      { status: "blocked", error: "ownerUnavailable" },
    ]);

    const staleReconcile = await runWithTenant(tenant(ownerId), () =>
      new PrismaRoutineRepo().settleRoutineRunUnscoped({
        routineRunId: runningRunId,
        routineId: inactiveRoutineId,
        expectedStatus: "running",
        status: "succeeded",
        now: new Date(),
      }),
    );
    expect(staleReconcile).toBe(false);
  });

  it("refuses to delete a terminal run whose inferred routine transcript still has an active turn", async () => {
    const protectedRoutineId = randomUUID();
    const protectedRunId = randomUUID();
    const protectedConversationId = randomUUID();
    const protectedTurnId = randomUUID();
    await insertRoutine(protectedRoutineId);
    await insertRoutineConversation(protectedConversationId);
    await insertRoutineRun({
      id: protectedRunId,
      routineId: protectedRoutineId,
    });
    await insertAgentTurn({
      id: protectedTurnId,
      conversationId: protectedConversationId,
      clientRequestId: protectedRunId,
    });
    const deleted = await runWithTenant(tenant(ownerId), () =>
      new PrismaRoutineRepo().deleteRoutineOrThrow(protectedRoutineId),
    );

    expect(deleted).toBeNull();
    for (const [table, id] of [
      ["Routine", protectedRoutineId],
      ["RoutineRun", protectedRunId],
      ["AgentConversation", protectedConversationId],
      ["AgentTurnRequest", protectedTurnId],
    ] as const) {
      const row = await client.query(`SELECT "id" FROM "${table}" WHERE "id" = $1`, [id]);
      expect(row.rowCount).toBe(1);
    }
  });

  it("refuses routine deletion during the lease-only admission gap", async () => {
    const protectedRoutineId = randomUUID();
    const protectedRunId = randomUUID();
    const protectedConversationId = randomUUID();
    await insertRoutine(protectedRoutineId);
    await insertRoutineConversation(protectedConversationId);
    await insertRoutineRun({
      id: protectedRunId,
      routineId: protectedRoutineId,
      conversationId: protectedConversationId,
    });
    await insertRunLease(protectedConversationId);
    const usageId = await insertReservedUsage();

    const deleted = await runWithTenant(tenant(ownerId), () =>
      new PrismaRoutineRepo().deleteRoutineOrThrow(protectedRoutineId),
    );

    expect(deleted).toBeNull();
    const rows = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM "Routine" WHERE "id" = $1) AS "routines",
         (SELECT COUNT(*)::int FROM "RoutineRun" WHERE "id" = $2) AS "runs",
         (SELECT COUNT(*)::int FROM "AgentConversation" WHERE "id" = $3) AS "conversations"`,
      [protectedRoutineId, protectedRunId, protectedConversationId],
    );
    expect(rows.rows[0]).toEqual({ routines: 1, runs: 1, conversations: 1 });
    const lease = await client.query(`SELECT "conversationId" FROM "AgentRunLease" WHERE "conversationId" = $1`, [
      protectedConversationId,
    ]);
    expect(lease.rowCount).toBe(1);
    const usage = await client.query<{
      state: string;
      turnRequestId: string | null;
    }>(`SELECT "state", "turnRequestId" FROM "AgentUsageEvent" WHERE "id" = $1`, [usageId]);
    expect(usage.rows[0]).toEqual({ state: "reserved", turnRequestId: null });
  });

  it("admits an agent turn only through its prelinked routine conversation", async () => {
    const admissionRoutineId = randomUUID();
    const admissionRunId = randomUUID();
    const admissionConversationId = randomUUID();
    const agentRunId = randomUUID();
    const turnRequestId = randomUUID();
    const userMessageId = randomUUID();
    await insertRoutine(admissionRoutineId);
    await insertRoutineRun({
      id: admissionRunId,
      routineId: admissionRoutineId,
      status: "running",
    });
    await runWithTenant(tenant(ownerId), () =>
      new PrismaAgentChatRepo().createAndLinkRoutineConversationForRun({
        routineRunId: admissionRunId,
        conversationId: admissionConversationId,
        title: "Lifecycle routine",
        now: new Date(),
      }),
    );
    await client.query(
      `INSERT INTO "AgentRunLease" ("conversationId", "companyId", "userId", "runId", "expiresAt")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [admissionConversationId, companyId, ownerId, agentRunId],
    );
    const usageId = await insertReservedUsage();

    await runWithTenant(tenant(ownerId), () =>
      new PrismaAgentChatRepo().admitAgentTurnOrThrow({
        conversationId: admissionConversationId,
        title: "Lifecycle routine",
        runId: agentRunId,
        reservationId: usageId,
        modelSpec: "openai/gpt-5.6-luna",
        servingProvider: "openai",
        recentMessageLimit: 8,
        turn: {
          kind: "create",
          turnRequestId,
          clientRequestId: admissionRunId,
          text: "Inspect the changed contact",
          pageRoute: null,
          userMessageId,
        },
      }),
    );

    const linked = await client.query<{
      conversationId: string | null;
      turnRequestId: string | null;
    }>(`SELECT "conversationId", "turnRequestId" FROM "RoutineRun" WHERE "id" = $1`, [admissionRunId]);
    expect(linked.rows[0]).toEqual({
      conversationId: admissionConversationId,
      turnRequestId,
    });
    const usage = await client.query<{
      state: string;
      turnRequestId: string | null;
    }>(`SELECT "state", "turnRequestId" FROM "AgentUsageEvent" WHERE "id" = $1`, [usageId]);
    expect(usage.rows[0]).toEqual({ state: "reserved", turnRequestId });
  });

  it("rolls back agent admission after lifecycle policy settles the routine run", async () => {
    const admissionRoutineId = randomUUID();
    const admissionRunId = randomUUID();
    const admissionConversationId = randomUUID();
    const agentRunId = randomUUID();
    const turnRequestId = randomUUID();
    await insertRoutine(admissionRoutineId);
    await insertRoutineRun({
      id: admissionRunId,
      routineId: admissionRoutineId,
      status: "running",
    });
    await runWithTenant(tenant(ownerId), () =>
      new PrismaAgentChatRepo().createAndLinkRoutineConversationForRun({
        routineRunId: admissionRunId,
        conversationId: admissionConversationId,
        title: "Lifecycle routine",
        now: new Date(),
      }),
    );
    await client.query(`UPDATE "RoutineRun" SET "status" = 'blocked' WHERE "id" = $1`, [admissionRunId]);
    await client.query(
      `INSERT INTO "AgentRunLease" ("conversationId", "companyId", "userId", "runId", "expiresAt")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [admissionConversationId, companyId, ownerId, agentRunId],
    );
    const usageId = await insertReservedUsage();

    await expect(
      runWithTenant(tenant(ownerId), () =>
        new PrismaAgentChatRepo().admitAgentTurnOrThrow({
          conversationId: admissionConversationId,
          title: "Lifecycle routine",
          runId: agentRunId,
          reservationId: usageId,
          modelSpec: "openai/gpt-5.6-luna",
          servingProvider: "openai",
          recentMessageLimit: 8,
          turn: {
            kind: "create",
            turnRequestId,
            clientRequestId: admissionRunId,
            text: "Inspect the changed contact",
            pageRoute: null,
            userMessageId: randomUUID(),
          },
        }),
      ),
    ).rejects.toThrow("Routine run changed");

    const turn = await client.query(`SELECT "id" FROM "AgentTurnRequest" WHERE "id" = $1`, [turnRequestId]);
    expect(turn.rowCount).toBe(0);
    const usage = await client.query<{
      state: string;
      turnRequestId: string | null;
    }>(`SELECT "state", "turnRequestId" FROM "AgentUsageEvent" WHERE "id" = $1`, [usageId]);
    expect(usage.rows[0]).toEqual({ state: "reserved", turnRequestId: null });
  });

  it("recovers and prunes a routine conversation abandoned between prelink and agent admission", async () => {
    const abandonedRoutineId = randomUUID();
    const abandonedRunId = randomUUID();
    const abandonedConversationId = randomUUID();
    const abandonedAt = new Date("2020-01-01T00:00:00.000Z");
    const reconcileAt = new Date("2020-01-01T01:00:00.000Z");
    await insertRoutine(abandonedRoutineId);
    await insertRoutineRun({
      id: abandonedRunId,
      routineId: abandonedRoutineId,
      status: "running",
      createdAt: abandonedAt,
    });
    await runWithoutTenant(() =>
      new PrismaRoutineRepo().prisma.routineRun.updateMany({
        where: { id: abandonedRunId, companyId },
        data: { startedAt: abandonedAt },
      }),
    );

    await runWithTenant(tenant(ownerId), () =>
      new PrismaAgentChatRepo().createAndLinkRoutineConversationForRun({
        routineRunId: abandonedRunId,
        conversationId: abandonedConversationId,
        title: "Abandoned before admission",
        now: abandonedAt,
      }),
    );

    const prelinked = await client.query<{
      conversationId: string | null;
      turnRequestId: string | null;
      status: string;
    }>(`SELECT "conversationId", "turnRequestId", "status" FROM "RoutineRun" WHERE "id" = $1`, [abandonedRunId]);
    expect(prelinked.rows[0]).toEqual({
      conversationId: abandonedConversationId,
      turnRequestId: null,
      status: "running",
    });
    const preAdmissionTurn = await client.query(`SELECT "id" FROM "AgentTurnRequest" WHERE "clientRequestId" = $1`, [
      abandonedRunId,
    ]);
    expect(preAdmissionTurn.rowCount).toBe(0);

    const repo = new PrismaRoutineRepo();
    const orphaned = await runWithTenant(tenant(ownerId), () =>
      repo.findOrphanedRunningRoutineRunsUnscoped(new Date(reconcileAt.getTime() - 10 * 60 * 1000), 1_000),
    );
    expect(orphaned.map((run) => run.id)).toContain(abandonedRunId);
    await expect(
      runWithTenant(tenant(ownerId), () =>
        repo.settleRoutineRunUnscoped({
          routineRunId: abandonedRunId,
          routineId: abandonedRoutineId,
          expectedStatus: "running",
          status: "failed",
          error: "startAbandoned",
          now: reconcileAt,
        }),
      ),
    ).resolves.toBe(true);

    const expired = await runWithTenant(tenant(ownerId), () =>
      repo.findExpiredRoutineRunsUnscoped(new Date("2021-01-01T00:00:00.000Z"), 1_000),
    );
    expect(expired.map((run) => run.id)).toContain(abandonedRunId);
    await expect(runWithTenant(tenant(ownerId), () => repo.deleteRoutineRunsUnscoped([abandonedRunId]))).resolves.toBe(
      1,
    );

    const remaining = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM "RoutineRun" WHERE "id" = $1) AS "runs",
         (SELECT COUNT(*)::int FROM "AgentConversation" WHERE "id" = $2) AS "conversations"`,
      [abandonedRunId, abandonedConversationId],
    );
    expect(remaining.rows[0]).toEqual({ runs: 0, conversations: 0 });
    await client.query(`DELETE FROM "Routine" WHERE "id" = $1`, [abandonedRoutineId]);
  });

  it("blocks a failed routine start while its prelinked conversation still has no turn", async () => {
    const failedRoutineId = randomUUID();
    const failedRunId = randomUUID();
    const failedConversationId = randomUUID();
    await insertRoutine(failedRoutineId);
    await insertRoutineRun({
      id: failedRunId,
      routineId: failedRoutineId,
      status: "running",
    });
    await runWithTenant(tenant(ownerId), () =>
      new PrismaAgentChatRepo().createAndLinkRoutineConversationForRun({
        routineRunId: failedRunId,
        conversationId: failedConversationId,
        title: "Pre-admission failure",
        now: new Date(),
      }),
    );

    await new FailRoutineRunInteractor(new PrismaRoutineRepo()).invoke({
      routineRunId: failedRunId,
      expectedExecutorUserId: ownerId,
      reason: "startFailed",
    });

    const failed = await client.query<{
      status: string;
      error: string | null;
      turnRequestId: string | null;
    }>(`SELECT "status", "error", "turnRequestId" FROM "RoutineRun" WHERE "id" = $1`, [failedRunId]);
    expect(failed.rows[0]).toEqual({
      status: "blocked",
      error: "startFailed",
      turnRequestId: null,
    });
    await client.query(`DELETE FROM "RoutineRun" WHERE "id" = $1`, [failedRunId]);
    await client.query(`DELETE FROM "AgentConversation" WHERE "id" = $1`, [failedConversationId]);
    await client.query(`DELETE FROM "Routine" WHERE "id" = $1`, [failedRoutineId]);
  });

  it("does not settle an orphan candidate after agent admission links its turn", async () => {
    const lateRoutineId = randomUUID();
    const lateRunId = randomUUID();
    const lateConversationId = randomUUID();
    const agentRunId = randomUUID();
    const turnRequestId = randomUUID();
    const old = new Date("2020-01-01T00:00:00.000Z");
    await insertRoutine(lateRoutineId);
    await insertRoutineRun({
      id: lateRunId,
      routineId: lateRoutineId,
      status: "running",
      createdAt: old,
    });
    await runWithoutTenant(() =>
      new PrismaRoutineRepo().prisma.routineRun.updateMany({
        where: { id: lateRunId, companyId },
        data: { startedAt: old },
      }),
    );
    await runWithTenant(tenant(ownerId), () =>
      new PrismaAgentChatRepo().createAndLinkRoutineConversationForRun({
        routineRunId: lateRunId,
        conversationId: lateConversationId,
        title: "Late admission",
        now: old,
      }),
    );

    const prelinked = await client.query<{
      status: string;
      turnRequestId: string | null;
    }>(`SELECT "status", "turnRequestId" FROM "RoutineRun" WHERE "id" = $1`, [lateRunId]);
    expect(prelinked.rows[0]).toEqual({
      status: "running",
      turnRequestId: null,
    });
    const preAdmissionTurn = await client.query(`SELECT "id" FROM "AgentTurnRequest" WHERE "clientRequestId" = $1`, [
      lateRunId,
    ]);
    expect(preAdmissionTurn.rowCount).toBe(0);

    const repo = new PrismaRoutineRepo();
    const orphaned = await runWithTenant(tenant(ownerId), () =>
      repo.findOrphanedRunningRoutineRunsUnscoped(new Date("2020-01-01T00:30:00.000Z"), 1_000),
    );
    expect(orphaned.map((run) => run.id)).toContain(lateRunId);

    await client.query(
      `INSERT INTO "AgentRunLease" ("conversationId", "companyId", "userId", "runId", "expiresAt")
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
      [lateConversationId, companyId, ownerId, agentRunId],
    );
    const usageId = await insertReservedUsage();
    await runWithTenant(tenant(ownerId), () =>
      new PrismaAgentChatRepo().admitAgentTurnOrThrow({
        conversationId: lateConversationId,
        title: "Late admission",
        runId: agentRunId,
        reservationId: usageId,
        modelSpec: "openai/gpt-5.6-luna",
        servingProvider: "openai",
        recentMessageLimit: 8,
        turn: {
          kind: "create",
          turnRequestId,
          clientRequestId: lateRunId,
          text: "Inspect the changed contact",
          pageRoute: null,
          userMessageId: randomUUID(),
        },
      }),
    );

    await new FailRoutineRunInteractor(repo).invoke({
      routineRunId: lateRunId,
      expectedExecutorUserId: ownerId,
      reason: "startFailed",
    });
    const run = await client.query<{
      status: string;
      turnRequestId: string | null;
    }>(`SELECT "status", "turnRequestId" FROM "RoutineRun" WHERE "id" = $1`, [lateRunId]);
    expect(run.rows[0]).toEqual({ status: "running", turnRequestId });

    await client.query(`DELETE FROM "AgentRunLease" WHERE "conversationId" = $1`, [lateConversationId]);
    await client.query(`DELETE FROM "AgentUsageEvent" WHERE "id" = $1`, [usageId]);
    await client.query(`DELETE FROM "RoutineRun" WHERE "id" = $1`, [lateRunId]);
    await client.query(`DELETE FROM "AgentConversation" WHERE "id" = $1`, [lateConversationId]);
    await client.query(`DELETE FROM "Routine" WHERE "id" = $1`, [lateRoutineId]);
  });

  it("deletes linked and inferred routine transcripts but preserves unrelated conversations and settled billing", async () => {
    const deletedRoutineId = randomUUID();
    const linkedRunId = randomUUID();
    const inferredRunId = randomUUID();
    const linkedConversationId = randomUUID();
    const inferredConversationId = randomUUID();
    const unrelatedConversationId = randomUUID();
    const linkedTurnId = randomUUID();
    const inferredTurnId = randomUUID();
    const usageId = randomUUID();
    await insertRoutine(deletedRoutineId);
    for (const id of [linkedConversationId, inferredConversationId, unrelatedConversationId])
      await insertRoutineConversation(id);
    await insertRoutineRun({
      id: linkedRunId,
      routineId: deletedRoutineId,
      conversationId: linkedConversationId,
    });
    await insertRoutineRun({ id: inferredRunId, routineId: deletedRoutineId });
    await insertAgentTurn({
      id: linkedTurnId,
      conversationId: linkedConversationId,
      clientRequestId: linkedRunId,
      status: "completed",
    });
    await insertAgentTurn({
      id: inferredTurnId,
      conversationId: inferredConversationId,
      clientRequestId: inferredRunId,
      status: "completed",
    });
    await client.query(
      `INSERT INTO "AgentUsageEvent"
         ("id", "companyId", "userId", "turnRequestId", "state", "reservedCredits", "chargedCredits",
          "planSnapshot", "subscriptionStatusSnapshot", "allowanceCreditsSnapshot", "periodStart", "periodEnd",
          "settledAt")
       VALUES ($1, $2, $3, $4, 'settled', 5, 3, 'enterprise', 'active', 100,
               CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP)`,
      [usageId, companyId, ownerId, inferredTurnId],
    );

    const deleted = await runWithTenant(tenant(ownerId), () =>
      new PrismaRoutineRepo().deleteRoutineOrThrow(deletedRoutineId),
    );

    expect(deleted?.id).toBe(deletedRoutineId);
    const conversations = await client.query<{ id: string }>(
      `SELECT "id" FROM "AgentConversation" WHERE "id" = ANY($1) ORDER BY "id"`,
      [[linkedConversationId, inferredConversationId, unrelatedConversationId]],
    );
    expect(conversations.rows.map((conversation) => conversation.id)).toEqual([unrelatedConversationId]);
    const usage = await client.query<{
      state: string;
      turnRequestId: string | null;
    }>(`SELECT "state", "turnRequestId" FROM "AgentUsageEvent" WHERE "id" = $1`, [usageId]);
    expect(usage.rows[0]).toEqual({ state: "settled", turnRequestId: null });
  });

  it("prunes only safe terminal runs and preserves active or nonterminal work", async () => {
    const pruneRoutineId = randomUUID();
    const activeRunId = randomUUID();
    const safeRunId = randomUUID();
    const queuedRunId = randomUUID();
    const activeConversationId = randomUUID();
    const safeConversationId = randomUUID();
    const originalTurnId = randomUUID();
    const activeTurnId = randomUUID();
    const old = new Date("2020-01-01T00:00:00.000Z");
    await insertRoutine(pruneRoutineId);
    await insertRoutineConversation(activeConversationId);
    await insertRoutineConversation(safeConversationId);
    await insertRoutineRun({
      id: activeRunId,
      routineId: pruneRoutineId,
      createdAt: old,
    });
    await insertRoutineRun({
      id: safeRunId,
      routineId: pruneRoutineId,
      conversationId: safeConversationId,
      createdAt: old,
    });
    await insertRoutineRun({
      id: queuedRunId,
      routineId: pruneRoutineId,
      status: "queued",
      createdAt: old,
    });
    await insertAgentTurn({
      id: originalTurnId,
      conversationId: activeConversationId,
      clientRequestId: activeRunId,
      status: "completed",
    });
    await insertAgentTurn({
      id: activeTurnId,
      conversationId: activeConversationId,
      clientRequestId: randomUUID(),
      status: "completed",
    });
    await insertReservedUsage(activeTurnId);

    const repo = new PrismaRoutineRepo();
    const expired = await runWithTenant(tenant(ownerId), () =>
      repo.findExpiredRoutineRunsUnscoped(new Date("2021-01-01T00:00:00.000Z"), 1_000),
    );
    expect(expired.map((run) => run.id)).toEqual(expect.arrayContaining([activeRunId, safeRunId]));
    expect(expired.map((run) => run.id)).not.toContain(queuedRunId);

    const pruned = await runWithTenant(tenant(ownerId), () =>
      repo.deleteRoutineRunsUnscoped([activeRunId, safeRunId, queuedRunId]),
    );
    expect(pruned).toBe(1);

    const remainingRuns = await client.query<{ id: string }>(
      `SELECT "id" FROM "RoutineRun" WHERE "id" = ANY($1) ORDER BY "id"`,
      [[activeRunId, safeRunId, queuedRunId]],
    );
    expect(remainingRuns.rows.map((run) => run.id).sort()).toEqual([activeRunId, queuedRunId].sort());
    const remainingConversations = await client.query<{ id: string }>(
      `SELECT "id" FROM "AgentConversation" WHERE "id" = ANY($1) ORDER BY "id"`,
      [[activeConversationId, safeConversationId]],
    );
    expect(remainingConversations.rows.map((conversation) => conversation.id)).toEqual([activeConversationId]);
  });

  it("lets the owner pause and resume a routine while settling queued work", async () => {
    const ownerRoutineId = randomUUID();
    const queuedRunId = randomUUID();
    await insertRoutine(ownerRoutineId);
    await insertRoutineRun({
      id: queuedRunId,
      routineId: ownerRoutineId,
      status: "queued",
    });

    const repo = new PrismaRoutineRepo();
    const paused = await runWithTenant(tenant(ownerId), () =>
      repo.upsertRoutineOrThrow({ id: ownerRoutineId, enabled: false }),
    );
    expect(paused).toMatchObject({
      id: ownerRoutineId,
      ownerUserId: ownerId,
      enabled: false,
      disabledReason: "ownerPaused",
      nextRunAt: null,
    });
    const queued = await client.query<{
      status: string;
      error: string | null;
      finishedAt: Date | null;
    }>(`SELECT "status", "error", "finishedAt" FROM "RoutineRun" WHERE "id" = $1`, [queuedRunId]);
    expect(queued.rows[0]).toEqual({
      status: "skipped",
      error: "ownerPaused",
      finishedAt: expect.any(Date),
    });

    const resumed = await runWithTenant(tenant(ownerId), () =>
      repo.upsertRoutineOrThrow({ id: ownerRoutineId, enabled: true }),
    );
    expect(resumed).toMatchObject({
      id: ownerRoutineId,
      enabled: true,
      disabledReason: null,
    });
  });

  it("settles queued work without overwriting a newer routine outcome", async () => {
    const guardedRoutineId = randomUUID();
    const queuedRunId = randomUUID();
    const newerLastRunAt = new Date("2100-01-02T03:04:05.000Z");
    const pausedAt = new Date("2099-01-02T03:04:05.000Z");
    await insertRoutine(guardedRoutineId);
    await client.query(
      `UPDATE "Routine"
       SET "lastRunStatus" = 'succeeded', "lastRunAt" = $1
       WHERE "id" = $2`,
      [newerLastRunAt, guardedRoutineId],
    );
    const summaryBeforePause = await client.query<{ lastRunAt: Date }>(
      `SELECT "lastRunAt" FROM "Routine" WHERE "id" = $1`,
      [guardedRoutineId],
    );
    await client.query(
      `INSERT INTO "RoutineRun"
         ("id", "companyId", "routineId", "executedByUserId", "executedByName", "status", "triggerKind",
          "scheduledFor", "updatedAt")
       VALUES ($1, $2, $3, $4, 'Routine Tester', 'queued', 'event', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [queuedRunId, companyId, guardedRoutineId, ownerId],
    );

    await runWithTenant(tenant(ownerId), () => new PrismaRoutineRepo().pauseRoutineOrThrow(guardedRoutineId, pausedAt));

    const routine = await client.query<{
      lastRunStatus: string | null;
      lastRunAt: Date | null;
    }>(`SELECT "lastRunStatus", "lastRunAt" FROM "Routine" WHERE "id" = $1`, [guardedRoutineId]);
    expect(routine.rows[0]).toEqual({
      lastRunStatus: "succeeded",
      lastRunAt: summaryBeforePause.rows[0].lastRunAt,
    });
    const run = await client.query<{
      status: string;
      error: string | null;
      finishedAt: Date | null;
    }>(`SELECT "status", "error", "finishedAt" FROM "RoutineRun" WHERE "id" = $1`, [queuedRunId]);
    expect(run.rows[0]).toEqual({
      status: "skipped",
      error: "adminPaused",
      finishedAt: expect.any(Date),
    });
  });

  it("settles an older run without regressing newer routine metadata", async () => {
    const guardedRoutineId = randomUUID();
    const runningRunId = randomUUID();
    const newerLastRunAt = new Date("2100-01-02T03:04:05.000Z");
    const settledAt = new Date("2099-01-02T03:04:05.000Z");
    await insertRoutine(guardedRoutineId);
    await client.query(
      `UPDATE "Routine"
       SET "lastRunStatus" = 'failed', "lastRunAt" = $1
       WHERE "id" = $2`,
      [newerLastRunAt, guardedRoutineId],
    );
    const metadataBeforeSettlement = await client.query<{ lastRunAt: Date }>(
      `SELECT "lastRunAt" FROM "Routine" WHERE "id" = $1`,
      [guardedRoutineId],
    );
    await insertRoutineRun({
      id: runningRunId,
      routineId: guardedRoutineId,
      status: "running",
    });

    await expect(
      runWithTenant(tenant(ownerId), () =>
        new PrismaRoutineRepo().settleRoutineRunUnscoped({
          routineRunId: runningRunId,
          routineId: guardedRoutineId,
          expectedStatus: "running",
          status: "succeeded",
          now: settledAt,
        }),
      ),
    ).resolves.toBe(true);

    const run = await client.query<{ status: string; finishedAt: Date | null }>(
      `SELECT "status", "finishedAt" FROM "RoutineRun" WHERE "id" = $1`,
      [runningRunId],
    );
    expect(run.rows[0]).toEqual({
      status: "succeeded",
      finishedAt: expect.any(Date),
    });
    const routine = await client.query<{
      lastRunStatus: string | null;
      lastRunAt: Date | null;
    }>(`SELECT "lastRunStatus", "lastRunAt" FROM "Routine" WHERE "id" = $1`, [guardedRoutineId]);
    expect(routine.rows[0]).toEqual({
      lastRunStatus: "failed",
      lastRunAt: metadataBeforeSettlement.rows[0].lastRunAt,
    });
  });
});
