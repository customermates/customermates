import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import type { PrismaAgentChatRepo } from "../prisma-agent-chat.repository";

vi.mock("@/core/validation/zod-error-map-server", () => ({
  getZodParseContext: vi.fn().mockResolvedValue(undefined),
}));

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("interrupted agent attempts against PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const conversationId = randomUUID();
  let repo: PrismaAgentChatRepo;
  const tenant = createMockUser({ id: userId, companyId });
  const asTenant = <T>(run: () => Promise<T>) => runWithTenant(tenant, run);

  async function retryTerminatedAttempt() {
    const prior = await seed(false);
    const stored = await client.query('SELECT "userMessageId" FROM "AgentTurnRequest" WHERE id = $1', [
      prior.turnRequestId,
    ]);
    const userMessageId: string = stored.rows[0].userMessageId;
    await client.query(
      `INSERT INTO "AgentMessage" ("id","companyId","conversationId","turnRequestId","role","parts")
       VALUES ($1,$2,$3,$4,'user','[{"type":"text","text":"synthetic retry fixture"}]'::jsonb)`,
      [userMessageId, companyId, conversationId, prior.turnRequestId],
    );
    expect(await asTenant(() => repo.requestAgentTurnCancellation({ conversationId }))).toBe(true);
    expect(await repo.heartbeatAgentRunUnscoped(prior)).toBe(true);
    expect(await repo.reconcileInterruptedAgentTurnUnscoped(prior)).toEqual({ reconciled: true });

    const runId = randomUUID();
    const reservationId = randomUUID();
    await client.query(
      `INSERT INTO "AgentUsageEvent"
       ("id","companyId","userId","state","reservedCredits","chargedCredits",
        "planSnapshot","subscriptionStatusSnapshot","allowanceCreditsSnapshot","periodStart","periodEnd")
       VALUES ($1,$2,$3,'reserved',7,0,'pro','active',1000,CURRENT_TIMESTAMP,
               CURRENT_TIMESTAMP + INTERVAL '1 month')`,
      [reservationId, companyId, userId],
    );
    await client.query(
      `INSERT INTO "AgentRunLease" ("conversationId","companyId","userId","runId","expiresAt")
       VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP + INTERVAL '5 minutes')`,
      [conversationId, companyId, userId, runId],
    );
    await asTenant(() =>
      repo.admitAgentTurnOrThrow({
        conversationId,
        title: null,
        runId,
        reservationId,
        modelSpec: "openai/gpt-5-nano",
        servingProvider: "openai",
        recentMessageLimit: 10,
        turn: {
          kind: "retry",
          turnRequestId: prior.turnRequestId,
          priorRunId: prior.runId,
          priorAttemptCount: 1,
          userMessageId,
        },
      }),
    );
    return { prior, runId, reservationId };
  }

  async function attemptIdentity(turnRequestId: string) {
    const result = await client.query(
      `SELECT "runId","externalRunId","cancellationRequestedAt","heartbeatAt","status","attemptCount"
       FROM "AgentTurnRequest" WHERE id = $1 AND "companyId" = $2`,
      [turnRequestId, companyId],
    );
    return result.rows[0];
  }

  async function seed(started: boolean) {
    const turnRequestId = randomUUID();
    const runId = randomUUID();
    const externalRunId = `wrun_fixture_${randomUUID()}`;
    const providerStartedAt = started ? new Date() : null;
    await client.query(
      `INSERT INTO "AgentTurnRequest"
       ("id","companyId","userId","conversationId","clientRequestId","text","status","runId",
        "externalRunId","userMessageId","modelSpec","providerStartedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,'synthetic interruption fixture','running',$6,$7,$8,
               'openai/gpt-5-nano',$9,CURRENT_TIMESTAMP)`,
      [
        turnRequestId,
        companyId,
        userId,
        conversationId,
        randomUUID(),
        runId,
        externalRunId,
        randomUUID(),
        providerStartedAt,
      ],
    );
    await client.query(
      `INSERT INTO "AgentUsageEvent"
       ("id","companyId","userId","turnRequestId","state","reservedCredits","chargedCredits",
        "planSnapshot","subscriptionStatusSnapshot","allowanceCreditsSnapshot","periodStart","periodEnd","providerStartedAt")
       VALUES ($1,$2,$3,$4,'reserved',7,0,'pro','active',1000,CURRENT_TIMESTAMP,
               CURRENT_TIMESTAMP + INTERVAL '1 month',$5)`,
      [randomUUID(), companyId, userId, turnRequestId, providerStartedAt],
    );
    await client.query(
      `INSERT INTO "AgentRunLease" ("conversationId","companyId","userId","runId","expiresAt")
       VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP + INTERVAL '5 minutes')`,
      [conversationId, companyId, userId, runId],
    );
    return {
      turnRequestId,
      conversationId,
      companyId,
      userId,
      runId,
      externalRunId,
    };
  }

  async function snapshot(turnRequestId: string) {
    const result = await client.query(
      `SELECT t."status", t."terminalAt", t."terminalCode", t."assistantMessageId",
              u."state", u."reservedCredits", u."chargedCredits", u."settledAt", u."providerStartedAt",
              (SELECT COUNT(*)::int FROM "AgentRunLease" l WHERE l."companyId" = t."companyId") AS leases,
              (SELECT COUNT(*)::int FROM "AgentRunRound" r WHERE r."turnRequestId" = t.id) AS rounds
       FROM "AgentTurnRequest" t JOIN "AgentUsageEvent" u ON u."turnRequestId" = t.id
       WHERE t.id = $1 AND t."companyId" = $2`,
      [turnRequestId, companyId],
    );
    return result.rows[0];
  }

  beforeAll(async () => {
    const { PrismaAgentChatRepo } = await import("../prisma-agent-chat.repository");
    repo = new PrismaAgentChatRepo();
    await client.connect();
    await client.query('INSERT INTO "Company" ("id","updatedAt") VALUES ($1,CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      `INSERT INTO "User" ("id","email","firstName","lastName","companyId","status","updatedAt")
       VALUES ($1,$2,'Interruption','Fixture',$3,'active',CURRENT_TIMESTAMP)`,
      [userId, `${userId}@example.invalid`, companyId],
    );
    await client.query(
      `INSERT INTO "AgentConversation" ("id","companyId","userId","updatedAt")
       VALUES ($1,$2,$3,CURRENT_TIMESTAMP)`,
      [conversationId, companyId, userId],
    );
  });

  beforeEach(async () => {
    await client.query('DELETE FROM "AgentMessage" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "AgentUsageEvent" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "AgentRunLease" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "AgentTurnRequest" WHERE "companyId" = $1', [companyId]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("releases only a provably pre-provider reservation without requiring a tenant session", async () => {
    const turn = await seed(false);

    expect(await repo.reconcileInterruptedAgentTurnUnscoped(turn)).toEqual({
      reconciled: true,
    });
    expect(await snapshot(turn.turnRequestId)).toMatchObject({
      status: "failed",
      state: "released",
      chargedCredits: 0,
      reservedCredits: 7,
      terminalAt: expect.any(Date),
      settledAt: expect.any(Date),
      leases: 0,
      rounds: 0,
    });
  });

  it("retains the full reservation after provider start even with no recorded rounds", async () => {
    const turn = await seed(true);

    await repo.reconcileInterruptedAgentTurnUnscoped(turn);

    expect(await snapshot(turn.turnRequestId)).toMatchObject({
      status: "uncertain",
      state: "retained",
      chargedCredits: 7,
      reservedCredits: 7,
      terminalAt: expect.any(Date),
      settledAt: expect.any(Date),
      leases: 0,
      rounds: 0,
    });
  });

  it("is idempotent under concurrent compensation and does not move settlement timestamps", async () => {
    const turn = await seed(true);
    const results = await Promise.all([
      repo.reconcileInterruptedAgentTurnUnscoped(turn),
      repo.reconcileInterruptedAgentTurnUnscoped(turn),
    ]);
    expect(results.filter((result) => result.reconciled)).toHaveLength(1);
    const settled = await snapshot(turn.turnRequestId);

    expect(await repo.reconcileInterruptedAgentTurnUnscoped(turn)).toEqual({
      reconciled: false,
    });
    expect(await snapshot(turn.turnRequestId)).toEqual(settled);
  });

  it.each(["turnRequestId", "conversationId", "companyId", "userId", "runId", "externalRunId"] as const)(
    "does not change an attempt with a mismatched %s",
    async (key) => {
      const turn = await seed(true);
      const before = await snapshot(turn.turnRequestId);

      expect(
        await repo.reconcileInterruptedAgentTurnUnscoped({
          ...turn,
          [key]: randomUUID(),
        }),
      ).toEqual({ reconciled: false });
      expect(await snapshot(turn.turnRequestId)).toEqual(before);
    },
  );

  it("fences a stale catch after a replacement attempt took over the same turn", async () => {
    const stale = await seed(false);
    const replacementRunId = randomUUID();
    await client.query('UPDATE "AgentTurnRequest" SET "runId" = $1 WHERE id = $2', [
      replacementRunId,
      stale.turnRequestId,
    ]);
    await client.query('UPDATE "AgentRunLease" SET "runId" = $1 WHERE "conversationId" = $2', [
      replacementRunId,
      conversationId,
    ]);
    const before = await snapshot(stale.turnRequestId);

    expect(await repo.reconcileInterruptedAgentTurnUnscoped(stale)).toEqual({
      reconciled: false,
    });
    expect(await snapshot(stale.turnRequestId)).toEqual(before);
  });

  it("leaves committed completion and measured credits unchanged after a late stream error", async () => {
    const turn = await seed(true);
    const assistantMessageId = randomUUID();
    await client.query(
      `UPDATE "AgentTurnRequest" SET status = 'completed', "terminalCode" = 'completed',
       "terminalAt" = CURRENT_TIMESTAMP, "assistantMessageId" = $1 WHERE id = $2`,
      [assistantMessageId, turn.turnRequestId],
    );
    await client.query(
      `UPDATE "AgentUsageEvent" SET state = 'settled', "chargedCredits" = 2, "costSource" = 'measured',
       "settledAt" = CURRENT_TIMESTAMP WHERE "turnRequestId" = $1`,
      [turn.turnRequestId],
    );
    await client.query('DELETE FROM "AgentRunLease" WHERE "conversationId" = $1', [conversationId]);
    const before = await snapshot(turn.turnRequestId);

    expect(await repo.reconcileInterruptedAgentTurnUnscoped(turn)).toEqual({
      reconciled: false,
    });
    expect(await snapshot(turn.turnRequestId)).toEqual(before);
    expect(before).toMatchObject({
      status: "completed",
      state: "settled",
      chargedCredits: 2,
      assistantMessageId,
    });
  });

  it("rolls back rather than refunding inconsistent provider-start markers", async () => {
    const turn = await seed(false);
    await client.query(
      'UPDATE "AgentUsageEvent" SET "providerStartedAt" = CURRENT_TIMESTAMP WHERE "turnRequestId" = $1',
      [turn.turnRequestId],
    );
    const before = await snapshot(turn.turnRequestId);

    await expect(repo.reconcileInterruptedAgentTurnUnscoped(turn)).rejects.toThrow("could not be released");
    expect(await snapshot(turn.turnRequestId)).toEqual(before);
    expect(before).toMatchObject({
      status: "running",
      state: "reserved",
      leases: 1,
    });
  });

  it("starts retry B without observing terminated A's workflow, cancellation, or heartbeat", async () => {
    const { prior, runId } = await retryTerminatedAttempt();

    expect(await attemptIdentity(prior.turnRequestId)).toEqual({
      runId,
      externalRunId: null,
      cancellationRequestedAt: null,
      heartbeatAt: null,
      status: "running",
      attemptCount: 2,
    });
    expect(await asTenant(() => repo.findAgentTurnExternalRun(conversationId))).toBeNull();
    expect(await asTenant(() => repo.findRunningAgentTurnForCancellation(conversationId))).toBeNull();
    expect(await repo.isAgentTurnCancellationRequestedUnscoped(prior)).toBe(false);

    expect(await repo.reconcileInterruptedAgentTurnUnscoped({ ...prior, runId })).toEqual({ reconciled: false });
    expect((await attemptIdentity(prior.turnRequestId)).status).toBe("running");
  });

  it("ignores late A linkage, accepts current B linkage, and never overwrites an established link", async () => {
    const { prior, runId } = await retryTerminatedAttempt();
    const workflowB = `wrun_fixture_${randomUUID()}`;

    await asTenant(() => repo.recordAgentTurnExternalRun(prior.turnRequestId, prior.runId, prior.externalRunId));
    expect((await attemptIdentity(prior.turnRequestId)).externalRunId).toBeNull();

    await asTenant(() => repo.recordAgentTurnExternalRun(prior.turnRequestId, runId, workflowB));
    expect(await asTenant(() => repo.findAgentTurnExternalRun(conversationId))).toBe(workflowB);

    await asTenant(() => repo.recordAgentTurnExternalRun(prior.turnRequestId, prior.runId, prior.externalRunId));
    await asTenant(() => repo.recordAgentTurnExternalRun(prior.turnRequestId, runId, "wrun_conflicting_duplicate"));
    expect((await attemptIdentity(prior.turnRequestId)).externalRunId).toBe(workflowB);
  });

  it("normal Stop before B linkage only requests cancellation and does not compensate B using A", async () => {
    const { prior, runId, reservationId } = await retryTerminatedAttempt();
    const { CancelAgentTurnInteractor } = await import("../cancel-agent-turn.interactor");
    const backgroundTasks = {
      isWorkflowTerminal: vi.fn().mockResolvedValue(true),
      resume: vi.fn().mockResolvedValue(true),
    };
    const entitlements = { require: vi.fn().mockResolvedValue(null) };
    const result = await asTenant(() =>
      new CancelAgentTurnInteractor(repo, entitlements as never, backgroundTasks as never).invoke({ conversationId }),
    );

    expect(result.ok && result.data.cancelling).toBe(true);
    expect(backgroundTasks.isWorkflowTerminal).not.toHaveBeenCalled();
    expect(backgroundTasks.resume).toHaveBeenCalledTimes(1);
    expect(await asTenant(() => repo.findRunningAgentTurnForCancellation(conversationId))).toMatchObject({
      id: prior.turnRequestId,
      runId,
      externalRunId: null,
    });
    expect(await attemptIdentity(prior.turnRequestId)).toMatchObject({
      status: "running",
      runId,
      externalRunId: null,
      cancellationRequestedAt: expect.any(Date),
    });
    const reservation = await client.query(
      'SELECT state, "chargedCredits", "settledAt" FROM "AgentUsageEvent" WHERE id = $1 AND "companyId" = $2',
      [reservationId, companyId],
    );
    expect(reservation.rows[0]).toEqual({ state: "reserved", chargedCredits: 0, settledAt: null });
    const lease = await client.query(
      'SELECT "runId" FROM "AgentRunLease" WHERE "conversationId" = $1 AND "companyId" = $2',
      [conversationId, companyId],
    );
    expect(lease.rows).toEqual([{ runId }]);
  });
});
