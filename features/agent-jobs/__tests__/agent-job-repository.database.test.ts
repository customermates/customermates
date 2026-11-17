import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { encodeAgentJobCursor } from "../agent-job-cursor";
import { PrismaAgentJobRepo } from "../prisma-agent-job.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const HOUR = 3_600_000;

describeDatabase("PrismaAgentJobRepo", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const ownerId = randomUUID();
  const colleagueId = randomUUID();
  const otherOwnerId = randomUUID();
  const runnerId = randomUUID();
  const repo = () => new PrismaAgentJobRepo();
  const asOwner = <T>(fn: () => Promise<T>, company = companyId, user = ownerId) =>
    runWithTenant(createMockUser({ id: user, companyId: company }), fn);

  const enqueue = (overrides: Partial<Parameters<PrismaAgentJobRepo["enqueue"]>[0]> = {}, company = companyId) =>
    asOwner(
      () =>
        repo().enqueue({
          runtime: "ownKey",
          sourceKind: "automation",
          sourceId: randomUUID(),
          ownerUserId: company === companyId ? ownerId : otherOwnerId,
          prompt: "Summarise the deal",
          promptUntrusted: false,
          model: null,
          runnerId: null,
          ...overrides,
        }),
      company,
      company === companyId ? ownerId : otherOwnerId,
    );

  async function row(id: string) {
    const { rows } = await client.query<{
      status: string;
      attempts: number;
      runnerId: string | null;
      error: string | null;
      timeoutAt: Date | null;
      finishedAt: Date | null;
      transcript: unknown;
      costMicrocents: string | null;
      inputTokens: number | null;
    }>(
      'SELECT "status", "attempts", "runnerId", "error", "timeoutAt", "finishedAt", "transcript", "costMicrocents", "inputTokens" FROM "AgentJob" WHERE "id" = $1',
      [id],
    );
    return rows[0];
  }

  async function age(id: string, patch: { timeoutAt?: Date; finishedAt?: Date; status?: string; attempts?: number }) {
    await client.query(
      `UPDATE "AgentJob" SET
         "timeoutAt" = COALESCE($2, "timeoutAt"),
         "finishedAt" = COALESCE($3, "finishedAt"),
         "status" = COALESCE($4::"AgentJobStatus", "status"),
         "attempts" = COALESCE($5, "attempts")
       WHERE "id" = $1`,
      [id, patch.timeoutAt ?? null, patch.finishedAt ?? null, patch.status ?? null, patch.attempts ?? null],
    );
  }

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, otherCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);
    for (const [id, company] of [
      [ownerId, companyId],
      [colleagueId, companyId],
      [otherOwnerId, otherCompanyId],
    ] as const) {
      await client.query(
        `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
         VALUES ($1, $2, 'Agent', 'Owner', $3, 'active'::"Status", CURRENT_TIMESTAMP)`,
        [id, `agent-${id}@example.invalid`, company],
      );
    }
    await client.query(
      `INSERT INTO "AgentRunner" ("id", "companyId", "name", "tokenHash", "createdById", "updatedAt")
       VALUES ($1, $2, 'ws-main', $3, $4, CURRENT_TIMESTAMP)`,
      [runnerId, companyId, `hash-${runnerId}`, ownerId],
    );
  });

  afterAll(async () => {
    const companies = [companyId, otherCompanyId];
    await client.query('DELETE FROM "AgentJob" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "AgentRunner" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [companies]);
    await client.end();
  });

  it("keeps a job when its runner is deleted and lets the workspace be deleted with runner jobs in it", async () => {
    const doomedCompany = randomUUID();
    const doomedOwner = randomUUID();
    const doomedRunner = randomUUID();
    const keptRunner = randomUUID();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [doomedCompany]);
    await client.query(
      `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
       VALUES ($1, $2, 'Agent', 'Owner', $3, 'active'::"Status", CURRENT_TIMESTAMP)`,
      [doomedOwner, `agent-${doomedOwner}@example.invalid`, doomedCompany],
    );
    for (const id of [doomedRunner, keptRunner]) {
      await client.query(
        `INSERT INTO "AgentRunner" ("id", "companyId", "name", "tokenHash", "createdById", "updatedAt")
         VALUES ($1, $2, 'laptop', $3, $4, CURRENT_TIMESTAMP)`,
        [id, doomedCompany, `hash-${id}`, doomedOwner],
      );
    }
    const jobs = await Promise.all(
      [doomedRunner, keptRunner].map((runner) =>
        runWithTenant(createMockUser({ id: doomedOwner, companyId: doomedCompany }), () =>
          repo().enqueue({
            runtime: "runner",
            sourceKind: "automation",
            sourceId: randomUUID(),
            ownerUserId: doomedOwner,
            prompt: "Summarise the deal",
            promptUntrusted: false,
            model: null,
            runnerId: runner,
          }),
        ),
      ),
    );

    await client.query('DELETE FROM "AgentRunner" WHERE "id" = $1', [doomedRunner]);
    const orphan = await client.query<{ companyId: string; runnerId: string | null }>(
      'SELECT "companyId", "runnerId" FROM "AgentJob" WHERE "id" = $1',
      [jobs[0].id],
    );
    expect(orphan.rows).toEqual([{ companyId: doomedCompany, runnerId: null }]);

    await client.query('DELETE FROM "Company" WHERE "id" = $1', [doomedCompany]);
    const left = await client.query('SELECT 1 FROM "AgentJob" WHERE "id" = ANY($1)', [jobs.map((job) => job.id)]);
    expect(left.rowCount).toBe(0);
  });

  it("writes a queued job for the caller's workspace and reads it back only there", async () => {
    const job = await enqueue({ prompt: "Check the pipeline" });
    expect(job).toMatchObject({ companyId, status: "queued", attempts: 0, runtime: "ownKey" });

    await asOwner(async () => {
      expect(await repo().findOne(job.id)).toMatchObject({ id: job.id, prompt: "Check the pipeline" });
    });
    await asOwner(
      async () => {
        expect(await repo().findOne(job.id)).toBeNull();
        expect((await repo().findPage({ cursor: null, limit: 50 })).map((found) => found.id)).not.toContain(job.id);
      },
      otherCompanyId,
      otherOwnerId,
    );
  });

  it("pages newest first with a cursor and filters by status, owner and source", async () => {
    const source = randomUUID();
    const created: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const job = await enqueue({
        sourceId: source,
        sourceKind: "paging",
        ownerUserId: index < 2 ? colleagueId : ownerId,
      });
      await client.query('UPDATE "AgentJob" SET "createdAt" = $2 WHERE "id" = $1', [
        job.id,
        new Date(Date.UTC(2026, 10, 1, index)),
      ]);
      created.push(job.id);
    }
    await age(created[4], { status: "failed" });

    await asOwner(async () => {
      const first = await repo().findPage({ sourceKind: "paging", sourceId: source, cursor: null, limit: 3 });
      expect(first.map((job) => job.id)).toEqual([created[4], created[3], created[2]]);
      const last = first.at(-1);
      if (!last) throw new Error("The page is empty");
      const second = await repo().findPage({
        sourceKind: "paging",
        cursor: { createdAt: last.createdAt, id: last.id },
        limit: 3,
        sourceId: source,
      });
      expect(second.map((job) => job.id)).toEqual([created[1], created[0]]);
      expect(encodeAgentJobCursor({ createdAt: last.createdAt, id: last.id })).toEqual(expect.any(String));

      const failed = await repo().findPage({ sourceKind: "paging", status: ["failed"], cursor: null, limit: 10 });
      expect(failed.map((job) => job.id)).toEqual([created[4]]);
      const mine = await repo().findPage({ sourceKind: "paging", ownerUserId: colleagueId, cursor: null, limit: 10 });
      expect(mine.map((job) => job.id)).toEqual([created[1], created[0]]);
      expect(Object.keys(first[0])).not.toContain("transcript");
      expect(Object.keys(first[0])).not.toContain("prompt");
    });
  });

  it("lets exactly one of two parallel claims win a queued job and counts the attempt", async () => {
    const job = await enqueue();
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + HOUR);
    const claim = () => repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: job.id, now, timeoutAt });

    const results = await Promise.all([claim(), claim(), claim()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)).toMatchObject({ id: job.id, status: "claimed", attempts: 1 });
    expect(await row(job.id)).toMatchObject({ status: "claimed", attempts: 1 });
  });

  it("never claims another workspace's job or a job of another runtime", async () => {
    const other = await enqueue({}, otherCompanyId);
    const own = await enqueue({ runtime: "mate" });
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + HOUR);

    expect(await repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: other.id, now, timeoutAt })).toBeNull();
    expect(await repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: own.id, now, timeoutAt })).toBeNull();
    expect(await row(other.id)).toMatchObject({ status: "queued", attempts: 0 });
    expect(await row(own.id)).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("hands a runner the oldest job that is unassigned or its own and binds it to the runner", async () => {
    const source = randomUUID();
    const strangerRunner = randomUUID();
    await client.query(
      `INSERT INTO "AgentRunner" ("id", "companyId", "name", "tokenHash", "createdById", "updatedAt")
       VALUES ($1, $2, 'laptop', $3, $4, CURRENT_TIMESTAMP)`,
      [strangerRunner, companyId, `hash-${strangerRunner}`, ownerId],
    );
    const reserved = await enqueue({ runtime: "runner", sourceId: source, runnerId: strangerRunner });
    const open = await enqueue({ runtime: "runner", sourceId: source });
    const pinned = await enqueue({ runtime: "runner", sourceId: source, runnerId });
    for (const [index, job] of [reserved, open, pinned].entries()) {
      await client.query('UPDATE "AgentJob" SET "createdAt" = $2 WHERE "id" = $1', [
        job.id,
        new Date(Date.UTC(2026, 10, 2, index)),
      ]);
    }
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + HOUR);

    const first = await repo().claimUnscoped({ companyId, runtime: "runner", runnerId, now, timeoutAt });
    expect(first).toMatchObject({ id: open.id, runnerId, status: "claimed" });
    const second = await repo().claimUnscoped({ companyId, runtime: "runner", runnerId, now, timeoutAt });
    expect(second).toMatchObject({ id: pinned.id, runnerId });
    expect(await repo().claimUnscoped({ companyId, runtime: "runner", runnerId, now, timeoutAt })).toBeNull();
    expect(await row(reserved.id)).toMatchObject({ status: "queued", runnerId: strangerRunner });
  });

  it("runs a claimed job, appends transcript events up to the cap and finishes it once", async () => {
    const job = await enqueue();
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + HOUR);
    await repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: job.id, now, timeoutAt });
    expect(await repo().startUnscoped({ id: job.id, companyId: otherCompanyId, now, timeoutAt })).toBe(false);
    expect(await repo().startUnscoped({ id: job.id, companyId, now, timeoutAt })).toBe(true);
    expect(await repo().startUnscoped({ id: job.id, companyId, now, timeoutAt })).toBe(false);

    await repo().appendEventsUnscoped({
      id: job.id,
      companyId,
      events: [1, 2, 3].map((n) => ({ type: "message", at: `t${n}`, role: "assistant", text: `m${n}` })),
      maxEvents: 4,
    });
    await repo().appendEventsUnscoped({
      id: job.id,
      companyId,
      events: [4, 5].map((n) => ({ type: "message", at: `t${n}`, role: "assistant", text: `m${n}` })),
      maxEvents: 4,
    });
    expect(((await row(job.id)).transcript as Array<{ text: string }>).map((event) => event.text)).toEqual([
      "m2",
      "m3",
      "m4",
      "m5",
    ]);

    const finish = {
      id: job.id,
      status: "succeeded" as const,
      result: { text: "done", reason: "stop", toolCalls: 2 },
      error: null,
      inputTokens: 120,
      outputTokens: 30,
      costMicrocents: 4_500_000_000,
      now,
    };
    expect(await repo().finishUnscoped({ ...finish, companyId: otherCompanyId })).toBe(false);
    expect(await repo().finishUnscoped({ ...finish, companyId })).toBe(true);
    expect(await row(job.id)).toMatchObject({
      status: "succeeded",
      inputTokens: 120,
      costMicrocents: "4500000000",
      timeoutAt: null,
    });
    expect(await repo().finishUnscoped({ ...finish, companyId, status: "failed" })).toBe(false);
    await repo().appendEventsUnscoped({
      id: job.id,
      companyId,
      events: [{ type: "message", at: "late", role: "assistant", text: "late" }],
      maxEvents: 4,
    });
    expect((await row(job.id)).transcript).toHaveLength(4);
  });

  it("discards only a queued job", async () => {
    const queued = await enqueue();
    const running = await enqueue();
    const now = new Date();
    await repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: running.id, now, timeoutAt: now });

    expect(await repo().discardQueuedUnscoped({ id: queued.id, companyId: otherCompanyId, error: "x", now })).toBe(
      false,
    );
    expect(await repo().discardQueuedUnscoped({ id: queued.id, companyId, error: "ownerInactive", now })).toBe(true);
    expect(await repo().discardQueuedUnscoped({ id: running.id, companyId, error: "ownerInactive", now })).toBe(false);
    expect(await row(queued.id)).toMatchObject({ status: "failed", error: "ownerInactive" });
    expect(await row(running.id)).toMatchObject({ status: "claimed" });
  });

  it("re-queues an expired job once and then marks it timed out, leaving live ones alone", async () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const past = new Date(now.getTime() - HOUR);
    const future = new Date(now.getTime() + HOUR);
    const firstTry = await enqueue();
    const secondTry = await enqueue();
    const live = await enqueue();
    const queued = await enqueue();
    await age(firstTry.id, { status: "running", attempts: 1, timeoutAt: past });
    await age(secondTry.id, { status: "claimed", attempts: 2, timeoutAt: past });
    await age(live.id, { status: "running", attempts: 1, timeoutAt: future });

    const swept = await repo().sweepTimeoutsUnscoped({ now, maxAttempts: 2, limit: 100 });
    const mine = swept.filter((job) => [firstTry.id, secondTry.id, live.id, queued.id].includes(job.id));
    expect(mine.map((job) => [job.id, job.requeued, job.runtime, job.attempts]).sort()).toEqual(
      [
        [firstTry.id, true, "ownKey", 1],
        [secondTry.id, false, "ownKey", 2],
      ].sort(),
    );
    expect(await row(firstTry.id)).toMatchObject({ status: "queued", timeoutAt: null });
    expect(await row(secondTry.id)).toMatchObject({ status: "timedOut", error: "timedOut" });
    expect((await row(secondTry.id)).finishedAt).not.toBeNull();
    expect(await row(live.id)).toMatchObject({ status: "running" });
    expect(await row(queued.id)).toMatchObject({ status: "queued" });
  });

  it("prunes finished jobs older than the cutoff of every workspace and keeps the rest", async () => {
    const cutoff = new Date("2026-08-01T00:00:00.000Z");
    const old = new Date("2026-05-01T00:00:00.000Z");
    const oldDone = await enqueue();
    const oldOtherWorkspace = await enqueue({}, otherCompanyId);
    const oldRunning = await enqueue();
    const recentDone = await enqueue();
    await age(oldDone.id, { status: "succeeded", finishedAt: old });
    await age(oldOtherWorkspace.id, { status: "failed", finishedAt: old });
    await age(oldRunning.id, { status: "running", finishedAt: old });
    await age(recentDone.id, { status: "succeeded", finishedAt: new Date("2026-10-01T00:00:00.000Z") });

    const deleted = await repo().deleteFinishedBeforeUnscoped(cutoff, 100);
    expect(deleted).toBeGreaterThanOrEqual(2);
    expect(await row(oldDone.id)).toBeUndefined();
    expect(await row(oldOtherWorkspace.id)).toBeUndefined();
    expect(await row(oldRunning.id)).toMatchObject({ status: "running" });
    expect(await row(recentDone.id)).toMatchObject({ status: "succeeded" });
  });
});
