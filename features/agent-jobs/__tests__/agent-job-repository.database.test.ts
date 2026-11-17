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
          idempotencyKey: null,
          ruleChain: [],
          ownerUserId: company === companyId ? ownerId : otherOwnerId,
          prompt: "Summarise the deal",
          promptUntrusted: false,
          model: null,
          pinnedRunnerId: null,
          ...overrides,
        }),
      company,
      company === companyId ? ownerId : otherOwnerId,
    );

  async function row(id: string) {
    const { rows } = await client.query<{
      status: string;
      attempts: number;
      startedAttempts: number;
      runnerId: string | null;
      pinnedRunnerId: string | null;
      error: string | null;
      queuedAt: Date;
      timeoutAt: Date | null;
      finishedAt: Date | null;
      transcript: unknown;
      costMicrocents: string | null;
      inputTokens: number | null;
    }>(
      'SELECT "status", "attempts", "startedAttempts", "runnerId", "pinnedRunnerId", "error", "queuedAt", "timeoutAt", "finishedAt", "transcript", "costMicrocents", "inputTokens" FROM "AgentJob" WHERE "id" = $1',
      [id],
    );
    return rows[0];
  }

  async function age(
    id: string,
    patch: {
      timeoutAt?: Date;
      finishedAt?: Date;
      status?: string;
      attempts?: number;
      startedAttempts?: number;
      queuedAt?: Date;
    },
  ) {
    await client.query(
      `UPDATE "AgentJob" SET
         "timeoutAt" = COALESCE($2, "timeoutAt"),
         "finishedAt" = COALESCE($3, "finishedAt"),
         "status" = COALESCE($4::"AgentJobStatus", "status"),
         "attempts" = COALESCE($5, "attempts"),
         "queuedAt" = COALESCE($6, "queuedAt"),
         "startedAttempts" = COALESCE($7, "startedAttempts")
       WHERE "id" = $1`,
      [
        id,
        patch.timeoutAt ?? null,
        patch.finishedAt ?? null,
        patch.status ?? null,
        patch.attempts ?? null,
        patch.queuedAt ?? null,
        patch.startedAttempts ?? null,
      ],
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
            idempotencyKey: null,
            ruleChain: [],
            ownerUserId: doomedOwner,
            prompt: "Summarise the deal",
            promptUntrusted: false,
            model: null,
            pinnedRunnerId: runner,
          }),
        ),
      ),
    );
    const now = new Date();
    for (const runner of [doomedRunner, keptRunner]) {
      const claimed = await repo().claimUnscoped({
        companyId: doomedCompany,
        runtime: "runner",
        runnerId: runner,
        now,
        timeoutAt: new Date(now.getTime() + HOUR),
      });
      expect(claimed).toMatchObject({ runnerId: runner, pinnedRunnerId: runner });
    }

    await client.query('DELETE FROM "AgentRunner" WHERE "id" = $1', [doomedRunner]);
    const orphan = await client.query<{ companyId: string; runnerId: string | null; pinnedRunnerId: string | null }>(
      'SELECT "companyId", "runnerId", "pinnedRunnerId" FROM "AgentJob" WHERE "id" = $1',
      [jobs[0].id],
    );
    expect(orphan.rows).toEqual([{ companyId: doomedCompany, runnerId: null, pinnedRunnerId: doomedRunner }]);

    await client.query('DELETE FROM "Company" WHERE "id" = $1', [doomedCompany]);
    const left = await client.query('SELECT 1 FROM "AgentJob" WHERE "id" = ANY($1)', [jobs.map((job) => job.id)]);
    expect(left.rowCount).toBe(0);
  });

  it("writes a queued job for the caller's workspace and reads it back only there", async () => {
    const chain = [randomUUID(), randomUUID()];
    const job = await enqueue({ prompt: "Check the pipeline", ruleChain: chain });
    expect(job).toMatchObject({ companyId, status: "queued", attempts: 0, runtime: "ownKey", ruleChain: chain });
    expect((await enqueue()).ruleChain).toEqual([]);

    await asOwner(async () => {
      expect(await repo().findOne(job.id)).toMatchObject({ id: job.id, prompt: "Check the pipeline" });
    });
    const now = new Date();
    const claimed = await repo().claimUnscoped({
      companyId,
      runtime: "ownKey",
      jobId: job.id,
      now,
      timeoutAt: new Date(now.getTime() + HOUR),
    });
    expect(claimed?.ruleChain).toEqual(chain);
    await age(job.id, { status: "queued" });
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

  it("claims at most the given number of hosted jobs of one workspace at a time, also when claims race", async () => {
    const workspace = randomUUID();
    const owner = randomUUID();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [workspace]);
    await client.query(
      `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
       VALUES ($1, $2, 'Agent', 'Owner', $3, 'active'::"Status", CURRENT_TIMESTAMP)`,
      [owner, `agent-${owner}@example.invalid`, workspace],
    );
    const queue = (runtime: "ownKey" | "mate" | "runner") =>
      runWithTenant(createMockUser({ id: owner, companyId: workspace }), () =>
        repo().enqueue({
          runtime,
          sourceKind: "automation",
          sourceId: randomUUID(),
          idempotencyKey: null,
          ruleChain: [],
          ownerUserId: owner,
          prompt: "Summarise the deal",
          promptUntrusted: false,
          model: null,
          pinnedRunnerId: null,
        }),
      );
    const now = new Date("2026-11-17T12:00:00.000Z");
    const timeoutAt = new Date(now.getTime() + HOUR);
    const claim = (job: { id: string; runtime: "ownKey" | "mate" | "runner" }, hostedLimit?: number) =>
      repo().claimUnscoped({
        companyId: workspace,
        runtime: job.runtime,
        jobId: job.id,
        now,
        timeoutAt,
        ...(hostedLimit === undefined ? {} : { hostedLimit }),
      });

    try {
      const first = await queue("ownKey");
      const second = await queue("mate");
      expect(await claim(first, 3)).toMatchObject({ id: first.id, status: "claimed" });
      expect(await claim(second, 3)).toMatchObject({ id: second.id, status: "claimed" });
      await repo().startUnscoped({ id: second.id, companyId: workspace, attempt: 1, now, timeoutAt });

      const racing = await Promise.all([queue("ownKey"), queue("ownKey"), queue("mate"), queue("ownKey")]);
      const won = (await Promise.all(racing.map((job) => claim(job, 3)))).filter(Boolean);
      expect(won).toHaveLength(1);
      const waiting = racing.filter((job) => job.id !== won[0]?.id);
      for (const job of waiting) expect(await row(job.id)).toMatchObject({ status: "queued", attempts: 0 });

      const onRunner = await queue("runner");
      expect(await claim(onRunner)).toMatchObject({ id: onRunner.id, status: "claimed" });
      const elsewhere = await enqueue();
      await repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: elsewhere.id, now, timeoutAt });

      expect(await claim(waiting[0], 3)).toBeNull();
      await repo().finishUnscoped({
        id: first.id,
        companyId: workspace,
        status: "succeeded",
        result: null,
        error: null,
        inputTokens: null,
        outputTokens: null,
        costMicrocents: null,
        now,
      });
      expect(await claim(waiting[0], 3)).toMatchObject({ id: waiting[0].id, status: "claimed", attempts: 1 });
      expect(await claim(waiting[1], 3)).toBeNull();
    } finally {
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [workspace]);
    }
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
    const reserved = await enqueue({ runtime: "runner", sourceId: source, pinnedRunnerId: strangerRunner });
    const open = await enqueue({ runtime: "runner", sourceId: source });
    const pinned = await enqueue({ runtime: "runner", sourceId: source, pinnedRunnerId: runnerId });
    expect(reserved).toMatchObject({ pinnedRunnerId: strangerRunner, runnerId: null });
    for (const [index, job] of [reserved, open, pinned].entries()) {
      await client.query('UPDATE "AgentJob" SET "createdAt" = $2 WHERE "id" = $1', [
        job.id,
        new Date(Date.UTC(2026, 10, 2, index)),
      ]);
    }
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + HOUR);

    const first = await repo().claimUnscoped({ companyId, runtime: "runner", runnerId, now, timeoutAt });
    expect(first).toMatchObject({ id: open.id, runnerId, pinnedRunnerId: null, status: "claimed" });
    const second = await repo().claimUnscoped({ companyId, runtime: "runner", runnerId, now, timeoutAt });
    expect(second).toMatchObject({ id: pinned.id, runnerId, pinnedRunnerId: runnerId });
    expect(await repo().claimUnscoped({ companyId, runtime: "runner", runnerId, now, timeoutAt })).toBeNull();
    expect(await row(reserved.id)).toMatchObject({ status: "queued", runnerId: null, pinnedRunnerId: strangerRunner });
  });

  it("frees a job for any runner again when the runner that claimed it went away, and keeps a pin", async () => {
    const source = randomUUID();
    const otherRunner = randomUUID();
    await client.query(
      `INSERT INTO "AgentRunner" ("id", "companyId", "name", "tokenHash", "createdById", "updatedAt")
       VALUES ($1, $2, 'desktop', $3, $4, CURRENT_TIMESTAMP)`,
      [otherRunner, companyId, `hash-${otherRunner}`, ownerId],
    );
    const open = await enqueue({ runtime: "runner", sourceId: source });
    const pinned = await enqueue({ runtime: "runner", sourceId: source, pinnedRunnerId: runnerId });
    await client.query('UPDATE "AgentJob" SET "createdAt" = $2 WHERE "id" = $1', [
      open.id,
      new Date(Date.UTC(2026, 9, 1)),
    ]);
    await client.query('UPDATE "AgentJob" SET "createdAt" = $2 WHERE "id" = $1', [
      pinned.id,
      new Date(Date.UTC(2026, 9, 2)),
    ]);
    const now = new Date("2026-11-17T12:00:00.000Z");
    const past = new Date(now.getTime() - HOUR);
    const claimAs = (runner: string, timeoutAt: Date) =>
      repo().claimUnscoped({ companyId, runtime: "runner", runnerId: runner, now, timeoutAt });

    expect(await claimAs(runnerId, past)).toMatchObject({ id: open.id, runnerId });
    expect(await claimAs(runnerId, past)).toMatchObject({ id: pinned.id, runnerId });
    await repo().sweepTimeoutsUnscoped({ now, limit: 500 });

    expect(await row(open.id)).toMatchObject({ status: "queued", runnerId: null, pinnedRunnerId: null });
    expect(await row(pinned.id)).toMatchObject({ status: "queued", runnerId: null, pinnedRunnerId: runnerId });
    const future = new Date(now.getTime() + HOUR);
    expect(await claimAs(otherRunner, future)).toMatchObject({ id: open.id, runnerId: otherRunner, attempts: 2 });
    expect(await claimAs(otherRunner, future)).toBeNull();
    expect(await claimAs(runnerId, future)).toMatchObject({ id: pinned.id, runnerId, attempts: 2 });
  });

  it("ends jobs that waited in the queue past the expiry as timed out and leaves the rest", async () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
    const stuckRunner = await enqueue({ runtime: "runner" });
    const stuckHosted = await enqueue({ runtime: "ownKey" });
    const waiting = await enqueue({ runtime: "runner" });
    const running = await enqueue({ runtime: "runner" });
    await age(stuckRunner.id, { queuedAt: minutesAgo(16) });
    await age(stuckHosted.id, { queuedAt: minutesAgo(40) });
    await age(waiting.id, { queuedAt: minutesAgo(14) });
    await age(running.id, { queuedAt: minutesAgo(40), status: "running" });

    const expired = await repo().expireQueuedUnscoped({ queuedBefore: minutesAgo(15), now, limit: 500 });

    expect(expired).toBeGreaterThanOrEqual(2);
    expect(await row(stuckRunner.id)).toMatchObject({ status: "timedOut", error: "queueExpired", finishedAt: now });
    expect(await row(stuckHosted.id)).toMatchObject({ status: "timedOut", error: "queueExpired" });
    expect(await row(waiting.id)).toMatchObject({ status: "queued", finishedAt: null });
    expect(await row(running.id)).toMatchObject({ status: "running" });
  });

  it("cancels the jobs of a revoked runner: the ones it runs and the queued ones pinned to it", async () => {
    const revoked = randomUUID();
    await client.query(
      `INSERT INTO "AgentRunner" ("id", "companyId", "name", "tokenHash", "createdById", "updatedAt")
       VALUES ($1, $2, 'revoked', $3, $4, CURRENT_TIMESTAMP)`,
      [revoked, companyId, `hash-${revoked}`, ownerId],
    );
    const source = randomUUID();
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + HOUR);
    const runningThere = await enqueue({ runtime: "runner", sourceId: source, pinnedRunnerId: revoked });
    await repo().claimUnscoped({
      companyId,
      runtime: "runner",
      jobId: runningThere.id,
      runnerId: revoked,
      now,
      timeoutAt,
    });
    const queuedForIt = await enqueue({ runtime: "runner", sourceId: source, pinnedRunnerId: revoked });
    const queuedForAnyone = await enqueue({ runtime: "runner", sourceId: source });
    const elsewhere = await enqueue({ runtime: "runner", sourceId: source });
    await repo().claimUnscoped({ companyId, runtime: "runner", jobId: elsewhere.id, runnerId, now, timeoutAt });

    expect(await repo().cancelForRunnerUnscoped({ companyId: otherCompanyId, runnerId: revoked, now })).toBe(0);
    expect(await repo().cancelForRunnerUnscoped({ companyId, runnerId: revoked, now })).toBe(2);

    expect(await row(runningThere.id)).toMatchObject({ status: "cancelled", error: "runnerRevoked", timeoutAt: null });
    expect(await row(queuedForIt.id)).toMatchObject({ status: "cancelled", error: "runnerRevoked" });
    expect((await row(queuedForIt.id)).finishedAt).not.toBeNull();
    expect(await row(queuedForAnyone.id)).toMatchObject({ status: "queued" });
    expect(await row(elsewhere.id)).toMatchObject({ status: "claimed", runnerId });
    expect(
      await repo().finishUnscoped({
        id: runningThere.id,
        companyId,
        attempt: 1,
        status: "succeeded",
        result: null,
        error: null,
        inputTokens: null,
        outputTokens: null,
        costMicrocents: null,
        now,
      }),
    ).toBe(false);
  });

  it("cancels the queued jobs of a rule, by call and by sweep once the rule is disabled or gone", async () => {
    const liveRule = randomUUID();
    const disabledRule = randomUUID();
    const deletedRule = randomUUID();
    for (const [id, enabled] of [
      [liveRule, true],
      [disabledRule, false],
    ] as const) {
      await client.query(
        `INSERT INTO "AutomationRule" ("id", "companyId", "name", "enabled", "triggerKind", "trigger", "effects", "updatedAt")
         VALUES ($1, $2, 'Rule', $3, 'recordUpdated'::"AutomationTriggerKind", '{}'::jsonb, '[]'::jsonb, CURRENT_TIMESTAMP)`,
        [id, companyId, enabled],
      );
    }
    const now = new Date();
    const ofLive = await enqueue({ runtime: "runner", ruleChain: [disabledRule, liveRule] });
    const ofDisabled = await enqueue({ runtime: "runner", ruleChain: [liveRule, disabledRule] });
    const ofDeleted = await enqueue({ runtime: "runner", ruleChain: [deletedRule] });
    const withoutRule = await enqueue({ runtime: "runner" });
    const runningOfDisabled = await enqueue({ runtime: "runner", ruleChain: [disabledRule] });
    await age(runningOfDisabled.id, { status: "running" });
    const byCall = await enqueue({ runtime: "runner", ruleChain: [liveRule] });

    expect(await repo().cancelQueuedForRuleUnscoped({ companyId: otherCompanyId, ruleId: liveRule, now })).toBe(0);
    await age(ofLive.id, { status: "claimed" });
    expect(await repo().cancelQueuedForRuleUnscoped({ companyId, ruleId: liveRule, now })).toBe(1);
    expect(await row(byCall.id)).toMatchObject({ status: "cancelled", error: "ruleInactive" });
    await age(ofLive.id, { status: "queued" });

    expect(await repo().cancelQueuedOfInactiveRulesUnscoped({ now, limit: 500 })).toBeGreaterThanOrEqual(2);
    expect(await row(ofDisabled.id)).toMatchObject({ status: "cancelled", error: "ruleInactive" });
    expect(await row(ofDeleted.id)).toMatchObject({ status: "cancelled", error: "ruleInactive" });
    expect((await row(ofDeleted.id)).finishedAt).not.toBeNull();
    expect(await row(ofLive.id)).toMatchObject({ status: "queued" });
    expect(await row(withoutRule.id)).toMatchObject({ status: "queued" });
    expect(await row(runningOfDisabled.id)).toMatchObject({ status: "running" });
    await client.query('DELETE FROM "AutomationRule" WHERE "companyId" = $1', [companyId]);
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

  it("refuses the start, the transcript and the result of an attempt the job has moved on from", async () => {
    const job = await enqueue();
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + HOUR);
    const claim = () => repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: job.id, now, timeoutAt });
    const event = (text: string) => ({ type: "message", at: "t", role: "assistant", text });
    const finish = {
      id: job.id,
      companyId,
      status: "succeeded" as const,
      result: { text: "late", reason: "stop", toolCalls: 0 },
      error: null,
      inputTokens: null,
      outputTokens: null,
      costMicrocents: null,
      now,
    };

    const first = await claim();
    expect(first?.attempts).toBe(1);
    await repo().appendEventsUnscoped({ id: job.id, companyId, attempt: 1, events: [event("first")], maxEvents: 10 });
    await age(job.id, { status: "queued" });
    const second = await claim();
    expect(second?.attempts).toBe(2);

    expect(await repo().startUnscoped({ id: job.id, companyId, attempt: 1, now, timeoutAt })).toBe(false);
    expect(
      await repo().appendEventsUnscoped({ id: job.id, companyId, attempt: 1, events: [event("stale")], maxEvents: 10 }),
    ).toBe(false);
    expect(await repo().appendEventsUnscoped({ id: job.id, companyId, attempt: 1, events: [], maxEvents: 10 })).toBe(
      false,
    );
    expect(await repo().finishUnscoped({ ...finish, attempt: 1 })).toBe(false);
    expect(await row(job.id)).toMatchObject({ status: "claimed", attempts: 2, finishedAt: null });

    expect(await repo().startUnscoped({ id: job.id, companyId, attempt: 2, now, timeoutAt })).toBe(true);
    expect(
      await repo().appendEventsUnscoped({
        id: job.id,
        companyId,
        attempt: 2,
        events: [event("second")],
        maxEvents: 10,
      }),
    ).toBe(true);
    expect(await repo().appendEventsUnscoped({ id: job.id, companyId, attempt: 2, events: [], maxEvents: 10 })).toBe(
      true,
    );
    expect(await repo().finishUnscoped({ ...finish, attempt: 2 })).toBe(true);
    const stored = (await row(job.id)).transcript as Array<{ type: string; text?: string }>;
    expect(stored.map((entry) => entry.text ?? entry.type)).toEqual(["first", "second"]);
  });

  it("keeps every event when transcript appends arrive at the same time", async () => {
    const job = await enqueue();
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + HOUR);
    await repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: job.id, now, timeoutAt });
    const texts = Array.from({ length: 12 }, (_, index) => `m${index}`);

    const appended = await Promise.all(
      texts.map((text) =>
        repo().appendEventsUnscoped({
          id: job.id,
          companyId,
          attempt: 1,
          events: [{ type: "message", at: "t", role: "assistant", text }],
          maxEvents: 50,
        }),
      ),
    );

    expect(appended.every(Boolean)).toBe(true);
    const stored = ((await row(job.id)).transcript as Array<{ text: string }>).map((entry) => entry.text);
    expect([...stored].sort()).toEqual([...texts].sort());
  });

  it("keeps one job per idempotency key in a workspace, also when two enqueues race", async () => {
    const key = `rule:${randomUUID()}:0`;

    const first = await enqueue({ idempotencyKey: key, prompt: "First" });
    const again = await enqueue({ idempotencyKey: key, prompt: "Replay" });
    const raced = await Promise.all([1, 2, 3].map(() => enqueue({ idempotencyKey: `${key}-race` })));
    const otherWorkspace = await enqueue({ idempotencyKey: key }, otherCompanyId);
    const withoutKey = await Promise.all([enqueue(), enqueue()]);

    expect(again).toMatchObject({ id: first.id, prompt: "First" });
    expect(new Set(raced.map((job) => job.id)).size).toBe(1);
    expect(otherWorkspace.id).not.toBe(first.id);
    expect(withoutKey[0].id).not.toBe(withoutKey[1].id);
    const stored = await client.query('SELECT 1 FROM "AgentJob" WHERE "idempotencyKey" LIKE $1', [`${key}%`]);
    expect(stored.rowCount).toBe(3);
    await asOwner(async () => {
      expect(await repo().findByIdempotencyKey(key)).toMatchObject({ id: first.id });
      expect(await repo().findByIdempotencyKey(`${key}-missing`)).toBeNull();
    });
    await asOwner(
      async () => {
        expect(await repo().findByIdempotencyKey(key)).toMatchObject({ id: otherWorkspace.id });
      },
      otherCompanyId,
      otherOwnerId,
    );
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

  it("marks an expired job whose attempt started as timed out, hosted or on a runner, leaving live ones alone", async () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const past = new Date(now.getTime() - HOUR);
    const future = new Date(now.getTime() + HOUR);
    const hosted = await enqueue();
    const onRunner = await enqueue({ runtime: "runner" });
    const live = await enqueue();
    const queued = await enqueue();
    await age(hosted.id, { status: "running", attempts: 1, startedAttempts: 1, timeoutAt: past });
    await age(onRunner.id, { status: "running", attempts: 2, startedAttempts: 1, timeoutAt: past });
    await age(live.id, { status: "running", attempts: 1, startedAttempts: 1, timeoutAt: future });

    const swept = await repo().sweepTimeoutsUnscoped({ now, limit: 100 });
    const mine = swept.filter((job) => [hosted.id, onRunner.id, live.id, queued.id].includes(job.id));
    expect(mine.map((job) => [job.id, job.requeued, job.runtime, job.attempts, job.started]).sort()).toEqual(
      [
        [hosted.id, false, "ownKey", 1, true],
        [onRunner.id, false, "runner", 2, true],
      ].sort(),
    );
    for (const job of [hosted, onRunner]) {
      expect(await row(job.id)).toMatchObject({ status: "timedOut", error: "timedOut", timeoutAt: null });
      expect((await row(job.id)).finishedAt).toEqual(now);
    }
    expect(await repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: hosted.id, now, timeoutAt: future })).toBe(
      null,
    );
    expect(await row(live.id)).toMatchObject({ status: "running" });
    expect(await row(queued.id)).toMatchObject({ status: "queued" });
  });

  it("gives a claim that never started back to the queue without counting it or renewing its queue time", async () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const queuedAt = new Date(now.getTime() - 5 * 60_000);
    const confirmBy = new Date(now.getTime() - 60_000);
    const job = await enqueue({ runtime: "runner" });
    await age(job.id, { queuedAt });
    const claim = (at: Date, timeoutAt: Date) =>
      repo().claimUnscoped({ companyId, runtime: "runner", jobId: job.id, runnerId, now: at, timeoutAt });
    const sweep = async (at: Date) =>
      (await repo().sweepTimeoutsUnscoped({ now: at, limit: 500 })).find((swept) => swept.id === job.id);

    for (const attempt of [1, 2, 3]) {
      expect(await claim(queuedAt, confirmBy)).toMatchObject({ attempts: attempt, startedAttempts: 0 });
      expect(await sweep(now)).toMatchObject({ requeued: true, started: false, attempts: attempt });
      expect(await row(job.id)).toMatchObject({ status: "queued", startedAttempts: 0, queuedAt, runnerId: null });
    }

    const later = new Date(now.getTime() + HOUR);
    const claimed = await claim(now, later);
    expect(await repo().startUnscoped({ id: job.id, companyId, attempt: claimed?.attempts, now, timeoutAt: now })).toBe(
      true,
    );
    expect(await row(job.id)).toMatchObject({ status: "running", attempts: 4, startedAttempts: 1 });
    expect(await sweep(later)).toMatchObject({ requeued: false, started: true });
    expect(await row(job.id)).toMatchObject({ status: "timedOut", attempts: 4, startedAttempts: 1 });
    expect(await claim(later, later)).toBeNull();
  });

  it("never starts a job twice, also when a started job were to reach the queue again", async () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const later = new Date(now.getTime() + HOUR);
    const job = await enqueue();
    const claim = (at: Date) =>
      repo().claimUnscoped({ companyId, runtime: "ownKey", jobId: job.id, now: at, timeoutAt: at });
    const start = (attempt: number, at: Date) =>
      repo().startUnscoped({ id: job.id, companyId, attempt, now: at, timeoutAt: at });

    await claim(now);
    expect(await start(1, now)).toBe(true);
    expect(await start(1, now)).toBe(false);
    await age(job.id, { status: "queued" });
    await claim(later);
    expect(await start(2, later)).toBe(false);
    expect(await row(job.id)).toMatchObject({ status: "claimed", attempts: 2, startedAttempts: 1 });

    const swept = await repo().sweepTimeoutsUnscoped({ now: new Date(later.getTime() + HOUR), limit: 500 });
    expect(swept.find((entry) => entry.id === job.id)).toMatchObject({ requeued: false, started: true });
    expect(await row(job.id)).toMatchObject({ status: "timedOut", transcript: null });
  });

  it("finds the hosted jobs that have waited in the queue past a moment, oldest first", async () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
    const lost = await enqueue({ runtime: "ownKey" });
    const lostLonger = await enqueue({ runtime: "mate" });
    const fresh = await enqueue({ runtime: "ownKey" });
    const runnerJob = await enqueue({ runtime: "runner" });
    const claimed = await enqueue({ runtime: "ownKey" });
    await age(lost.id, { queuedAt: minutesAgo(3) });
    await age(lostLonger.id, { queuedAt: minutesAgo(9) });
    await age(fresh.id, { queuedAt: minutesAgo(1) });
    await age(runnerJob.id, { queuedAt: minutesAgo(9) });
    await age(claimed.id, { queuedAt: minutesAgo(9), status: "claimed" });

    const stale = await repo().findStaleQueuedUnscoped({
      runtimes: ["mate", "ownKey"],
      queuedBefore: minutesAgo(2),
      limit: 500,
    });
    const mine = stale.filter((job) => [lost.id, lostLonger.id, fresh.id, runnerJob.id, claimed.id].includes(job.id));
    expect(mine).toEqual([
      { id: lostLonger.id, companyId, ownerUserId: ownerId, runtime: "mate" },
      { id: lost.id, companyId, ownerUserId: ownerId, runtime: "ownKey" },
    ]);
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
