import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runWithoutTenant, runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaAutomationRuleRepo } from "../prisma-automation-rule.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PrismaAutomationRuleRepo tenant boundaries", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const planCompanyId = randomUUID();
  const ownerId = randomUUID();
  const planOwnerId = randomUUID();
  const goneOwnerId = randomUUID();
  const ruleId = randomUUID();
  const secondRuleId = randomUUID();
  const otherRuleId = randomUUID();
  const typeId = randomUUID();

  const subscriptions = {
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    pauseUnscoped: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  };
  const repo = (scoped?: string) => new PrismaAutomationRuleRepo(subscriptions as never, scoped);
  const asOwner = <T>(fn: () => Promise<T>, company = companyId) =>
    runWithTenant(createMockUser({ id: ownerId, companyId: company }), fn);

  async function insertRule(id: string, company: string, owner: string, createdAt = new Date()) {
    await client.query(
      `INSERT INTO "AutomationRule"
         ("id", "companyId", "ownerUserId", "name", "triggerKind", "trigger", "effects", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'Rule', 'messageReceived'::"AutomationTriggerKind", '{"kind":"messageReceived","channel":"any"}', '[]', $4, CURRENT_TIMESTAMP)`,
      [id, company, owner, createdAt],
    );
  }

  async function state(id: string) {
    const { rows } = await client.query<{ enabled: boolean; disabledReason: string | null }>(
      'SELECT "enabled", "disabledReason" FROM "AutomationRule" WHERE "id" = $1',
      [id],
    );
    return rows[0];
  }

  beforeAll(async () => {
    await client.connect();
    for (const id of [companyId, otherCompanyId, planCompanyId])
      await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [id]);
    for (const [id, company, status] of [
      [ownerId, companyId, "active"],
      [planOwnerId, planCompanyId, "active"],
      [goneOwnerId, planCompanyId, "inactive"],
    ] as const) {
      await client.query(
        `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "updatedAt")
         VALUES ($1, $2, 'Rule', 'Owner', $3, $4::"Status", CURRENT_TIMESTAMP)`,
        [id, `rule-${id}@example.invalid`, company, status],
      );
    }
    await insertRule(ruleId, companyId, ownerId);
    await insertRule(secondRuleId, companyId, ownerId);
    await insertRule(otherRuleId, otherCompanyId, ownerId);
  });

  afterAll(async () => {
    const companies = [companyId, otherCompanyId, planCompanyId];
    await client.query('DELETE FROM "AutomationRuleRun" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "AutomationRule" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [companies]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [companies]);
    await client.end();
  });

  it("reads, lists and counts only the rules of the workspace", async () => {
    await asOwner(async () => {
      expect(await repo().findRule(ruleId)).toMatchObject({ id: ruleId, companyId });
      expect(await repo().findRule(otherRuleId)).toBeNull();
      const page = await repo().findRules({ page: 1, pageSize: 50 });
      expect(page.total).toBe(2);
      expect(page.items.map((rule) => rule.id).sort()).toEqual([ruleId, secondRuleId].sort());
      expect(await repo().countActiveRules()).toBe(2);
      expect(await repo().countActiveRules(ruleId)).toBe(1);
    });
    expect(await runWithoutTenant(() => repo().getLabelsCompanyWide(companyId, [ruleId, otherRuleId]))).toEqual([
      { id: ruleId, name: "Rule" },
    ]);
  });

  it("never switches off or deletes a rule of another workspace", async () => {
    await asOwner(async () => {
      expect(await repo().setEnabled(otherRuleId, false, "disabledByUser")).toBeNull();
      expect(await repo().deleteRule(otherRuleId)).toBe(false);
    });
    expect(await state(otherRuleId)).toEqual({ enabled: true, disabledReason: null });
    expect(subscriptions.pause).not.toHaveBeenCalledWith(otherRuleId);
  });

  it("keeps the record subscription of a rule in step with the rule", async () => {
    await asOwner(async () => {
      const saved = await repo().saveRule(
        {
          name: "Won deals",
          enabled: true,
          ownerUserId: ownerId,
          triggerKind: "recordCreated",
          typeId,
          trigger: { kind: "recordCreated", typeId },
          conditions: [],
          effects: [],
        },
        { typeId, events: ["record.created"], changedFieldIds: [], query: { typeId, filters: [], relationships: [] } },
      );
      expect(subscriptions.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: saved.id, kind: "rule", ownerUserId: ownerId, typeId, enabled: true }),
        "create",
      );
      await repo().saveRule(
        {
          id: saved.id,
          name: "Won deals",
          enabled: true,
          ownerUserId: ownerId,
          triggerKind: "messageReceived",
          typeId: null,
          trigger: { kind: "messageReceived", channel: "any" },
          conditions: [],
          effects: [],
        },
        null,
      );
      expect(subscriptions.remove).toHaveBeenLastCalledWith(saved.id);
      await repo().setEnabled(saved.id, false, "disabledByUser");
      expect(subscriptions.pause).toHaveBeenLastCalledWith(saved.id);
      await repo().setEnabled(saved.id, true, null);
      expect(subscriptions.resume).toHaveBeenLastCalledWith(saved.id);
      expect(await repo().deleteRule(saved.id)).toBe(true);
      expect(subscriptions.remove).toHaveBeenLastCalledWith(saved.id);
    });
  });

  it("claims and settles a run only for the workspace that owns it", async () => {
    const occurrence = {
      companyId,
      ruleId,
      occurrenceKey: "event:boundary",
      triggerKind: "messageReceived" as const,
      typeId: null,
      recordId: null,
      payload: null,
      depth: 0,
      scheduledFor: new Date(),
    };
    const runId = await runWithoutTenant(() => repo().admitRunUnscoped(occurrence));
    expect(runId).toEqual(expect.any(String));
    expect(await runWithoutTenant(() => repo().admitRunUnscoped(occurrence))).toBeNull();
    if (!runId) throw new Error("The run was not admitted");

    const now = new Date();
    const stale = new Date(now.getTime() - 600_000);
    expect(await runWithoutTenant(() => repo().findRunUnscoped(otherCompanyId, runId))).toBeNull();
    expect(await runWithoutTenant(() => repo().findRunUnscoped(companyId, runId))).toMatchObject({
      run: { id: runId, status: "queued" },
      rule: { id: ruleId },
    });
    expect(await runWithoutTenant(() => repo().claimRunUnscoped(runId, otherCompanyId, now, stale))).toBe(false);
    expect(await runWithoutTenant(() => repo().claimRunUnscoped(runId, companyId, now, stale))).toBe(true);
    expect(await runWithoutTenant(() => repo().claimRunUnscoped(runId, companyId, now, stale))).toBe(false);

    const settlement = { runId, ruleId, status: "applied" as const, outcome: { effects: [] }, error: null, now };
    const lastRun = async () =>
      (
        await client.query<{ lastRunStatus: string | null; lastRunAt: Date | null; updatedAt: Date }>(
          'SELECT "lastRunStatus", "lastRunAt", "updatedAt" FROM "AutomationRule" WHERE "id" = $1',
          [ruleId],
        )
      ).rows[0];
    await client.query(`UPDATE "AutomationRule" SET "updatedAt" = '2026-11-01 00:00:00' WHERE "id" = $1`, [ruleId]);
    const before = await lastRun();
    await runWithoutTenant(() => repo().settleRunUnscoped({ ...settlement, companyId: otherCompanyId }));
    expect((await client.query('SELECT "status" FROM "AutomationRuleRun" WHERE "id" = $1', [runId])).rows[0]).toEqual({
      status: "running",
    });
    expect(await state(ruleId)).toEqual({ enabled: true, disabledReason: null });
    expect(await lastRun()).toEqual(before);
    await runWithoutTenant(() => repo().settleRunUnscoped({ ...settlement, companyId }));
    expect((await client.query('SELECT "status" FROM "AutomationRuleRun" WHERE "id" = $1', [runId])).rows[0]).toEqual({
      status: "applied",
    });
    const settled = await lastRun();
    expect(settled.lastRunStatus).toBe("applied");
    expect(settled.lastRunAt).toBeInstanceOf(Date);
    expect(settled.updatedAt).toEqual(before.updatedAt);

    await runWithoutTenant(() =>
      repo().settleRunUnscoped({ ...settlement, companyId, status: "failed", now: new Date(now.getTime() + 60_000) }),
    );
    expect(await lastRun()).toEqual(settled);
  });

  it("prunes finished runs of every workspace in batches and keeps unfinished ones", async () => {
    const old = new Date("2026-01-01T00:00:00.000Z");
    const insertRun = async (company: string, rule: string, status: string, key: string) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO "AutomationRuleRun"
           ("id", "companyId", "ruleId", "occurrenceKey", "status", "triggerKind", "scheduledFor", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::"AutomationRunStatus", 'messageReceived'::"AutomationTriggerKind", $6, $6, CURRENT_TIMESTAMP)`,
        [id, company, rule, key, status, old],
      );
      return id;
    };
    const finished = [
      await insertRun(companyId, ruleId, "applied", "prune:1"),
      await insertRun(companyId, ruleId, "failed", "prune:2"),
      await insertRun(otherCompanyId, otherRuleId, "skipped", "prune:3"),
    ];
    const queued = await insertRun(companyId, ruleId, "queued", "prune:4");
    const cutoff = new Date("2026-06-01T00:00:00.000Z");

    expect(await runWithoutTenant(() => repo().deleteRunsBeforeUnscoped(cutoff, 2))).toBe(2);
    expect(await runWithoutTenant(() => repo().deleteRunsBeforeUnscoped(cutoff, 2))).toBe(1);
    expect(await runWithoutTenant(() => repo().deleteRunsBeforeUnscoped(cutoff, 2))).toBe(0);
    const left = await client.query('SELECT "id" FROM "AutomationRuleRun" WHERE "id" = ANY($1)', [
      [...finished, queued],
    ]);
    expect(left.rows).toEqual([{ id: queued }]);
  });

  it("finds stale runs per workspace, oldest first, with the time they were admitted", async () => {
    const insertRun = async (company: string, rule: string, status: string, createdAt: Date, startedAt?: Date) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO "AutomationRuleRun"
           ("id", "companyId", "ruleId", "occurrenceKey", "status", "triggerKind", "scheduledFor", "startedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::"AutomationRunStatus", 'messageReceived'::"AutomationTriggerKind", $6, $7, $6, CURRENT_TIMESTAMP)`,
        [id, company, rule, `stale:${id}`, status, createdAt, startedAt ?? null],
      );
      return id;
    };
    const now = new Date("2026-11-17T12:00:00.000Z");
    const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
    await client.query(
      `DELETE FROM "AutomationRuleRun" WHERE "companyId" = ANY($1) AND "status" IN ('queued', 'running')`,
      [[companyId, otherCompanyId]],
    );
    const stuck = [
      await insertRun(companyId, ruleId, "running", minutesAgo(40), minutesAgo(12)),
      await insertRun(companyId, ruleId, "running", minutesAgo(30), minutesAgo(11)),
      await insertRun(companyId, ruleId, "queued", minutesAgo(20)),
    ];
    const neighbour = await insertRun(otherCompanyId, otherRuleId, "queued", minutesAgo(5));
    const fresh = [
      await insertRun(companyId, ruleId, "queued", minutesAgo(1)),
      await insertRun(companyId, ruleId, "running", minutesAgo(50), minutesAgo(3)),
      await insertRun(otherCompanyId, otherRuleId, "applied", minutesAgo(50), minutesAgo(49)),
    ];
    const mine: string[] = [...stuck, neighbour, ...fresh];

    const found = await runWithoutTenant(() =>
      repo().findStaleRunsUnscoped(minutesAgo(2), minutesAgo(10), { companies: 1000, perCompany: 2 }),
    );
    expect(found.filter((run) => mine.includes(run.id))).toEqual([
      { id: stuck[0], companyId, createdAt: minutesAgo(40) },
      { id: stuck[1], companyId, createdAt: minutesAgo(30) },
      { id: neighbour, companyId: otherCompanyId, createdAt: minutesAgo(5) },
    ]);
    const all = await runWithoutTenant(() =>
      repo().findStaleRunsUnscoped(minutesAgo(2), minutesAgo(10), { companies: 1000, perCompany: 1000 }),
    );
    expect(
      all
        .filter((run) => mine.includes(run.id))
        .map((run) => run.id)
        .sort(),
    ).toEqual([...stuck, neighbour].sort());
    await client.query('DELETE FROM "AutomationRuleRun" WHERE "id" = ANY($1)', [mine]);
  });

  it("finds enabled rules of one workspace by id or trigger", async () => {
    const found = await runWithoutTenant(() =>
      repo().findEnabledRulesUnscoped({ companyId, ids: [ruleId, otherRuleId], triggerKind: "messageReceived" }),
    );
    expect(found.map((rule) => rule.id)).toEqual([ruleId]);
    expect(
      await runWithoutTenant(() => repo().findEnabledRulesUnscoped({ companyId, triggerKind: "formSubmitted" })),
    ).toEqual([]);
  });

  it("switches off the rules of an owner in one workspace only", async () => {
    expect(await runWithoutTenant(() => repo().disableOwnerRulesUnscoped(companyId, ownerId, "ownerInactive"))).toBe(2);
    expect(await state(ruleId)).toEqual({ enabled: false, disabledReason: "ownerInactive" });
    expect(await state(otherRuleId)).toEqual({ enabled: true, disabledReason: null });
    const [pausedCompany, pausedIds] = subscriptions.pauseUnscoped.mock.lastCall as [string, string[]];
    expect(pausedCompany).toBe(companyId);
    expect([...pausedIds].sort()).toEqual([ruleId, secondRuleId].sort());

    subscriptions.pauseUnscoped.mockClear();
    expect(await runWithoutTenant(() => repo().disableOwnerRulesUnscoped(companyId, ownerId, "ownerInactive"))).toBe(0);
    expect(subscriptions.pauseUnscoped).not.toHaveBeenCalled();
  });

  it("pauses the newest rules above the plan limit and brings them back within a larger one", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries())
      await insertRule(id, planCompanyId, index === 4 ? goneOwnerId : planOwnerId, new Date(2026, 10, 1 + index));

    expect(await runWithoutTenant(() => repo(planCompanyId).syncRulesToPlanLimitCompanyWide(3))).toEqual({
      paused: 2,
      resumed: 0,
    });
    expect((await Promise.all(ids.map(state))).map((rule) => rule.disabledReason)).toEqual([
      null,
      null,
      null,
      "planPaused",
      "planPaused",
    ]);
    expect(subscriptions.pause).toHaveBeenCalledWith(ids[3]);
    expect(subscriptions.pause).toHaveBeenCalledWith(ids[4]);
    expect(await runWithoutTenant(() => repo(planCompanyId).syncRulesToPlanLimitCompanyWide(4))).toEqual({
      paused: 0,
      resumed: 1,
    });
    expect(await state(ids[3])).toEqual({ enabled: true, disabledReason: null });
    expect(subscriptions.resume).toHaveBeenCalledWith(ids[3]);
    expect(await runWithoutTenant(() => repo(planCompanyId).syncRulesToPlanLimitCompanyWide(null))).toEqual({
      paused: 0,
      resumed: 0,
    });
    expect(await state(ids[4])).toEqual({ enabled: false, disabledReason: "planPaused" });
    expect(await state(otherRuleId)).toEqual({ enabled: true, disabledReason: null });
  });

  it("gives the plan allowance to rules of active owners and restores the paused ones with the plan", async () => {
    const freeCompanyId = randomUUID();
    const alice = randomUUID();
    const bob = randomUUID();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [freeCompanyId]);
    for (const [id, status, pausedByPlanAt] of [
      [alice, "active", null],
      [bob, "inactive", new Date()],
    ] as const) {
      await client.query(
        `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "pausedByPlanAt", "updatedAt")
         VALUES ($1, $2, 'Rule', 'Owner', $3, $4::"Status", $5, CURRENT_TIMESTAMP)`,
        [id, `rule-${id}@example.invalid`, freeCompanyId, status, pausedByPlanAt],
      );
    }
    const bobs = [randomUUID(), randomUUID(), randomUUID()];
    const alices = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [index, id] of bobs.entries()) await insertRule(id, freeCompanyId, bob, new Date(2026, 9, 1 + index));
    for (const [index, id] of alices.entries())
      await insertRule(id, freeCompanyId, alice, new Date(2026, 10, 1 + index));
    const reasons = async (ids: string[]) => (await Promise.all(ids.map(state))).map((rule) => rule.disabledReason);
    const sync = (limit: number | null) =>
      runWithoutTenant(() => repo(freeCompanyId).syncRulesToPlanLimitCompanyWide(limit));

    try {
      expect(await sync(3)).toEqual({ paused: 4, resumed: 0 });
      expect(await reasons(bobs)).toEqual(["planPaused", "planPaused", "planPaused"]);
      expect(await reasons(alices)).toEqual([null, null, null, "planPaused"]);
      for (const id of bobs) expect(subscriptions.pause).toHaveBeenCalledWith(id);

      await client.query(
        `UPDATE "AutomationRule" SET "enabled" = FALSE, "disabledReason" = 'disabledByUser' WHERE "id" = $1`,
        [alices[0]],
      );
      expect(await sync(3)).toEqual({ paused: 0, resumed: 1 });
      expect(await reasons(alices)).toEqual(["disabledByUser", null, null, null]);
      expect(await reasons(bobs)).toEqual(["planPaused", "planPaused", "planPaused"]);

      subscriptions.pauseUnscoped.mockClear();
      await runWithoutTenant(() => repo().disableRuleUnscoped(freeCompanyId, bobs[0], "ownerInactive"));
      expect(await state(bobs[0])).toEqual({ enabled: false, disabledReason: "planPaused" });
      expect(subscriptions.pauseUnscoped).not.toHaveBeenCalled();
      await client.query(`UPDATE "AutomationRule" SET "enabled" = TRUE, "disabledReason" = NULL WHERE "id" = $1`, [
        bobs[1],
      ]);
      await runWithoutTenant(() => repo().disableRuleUnscoped(freeCompanyId, bobs[1], "ownerInactive"));
      expect(await state(bobs[1])).toEqual({ enabled: false, disabledReason: "planPaused" });
      expect(subscriptions.pauseUnscoped).toHaveBeenCalledExactlyOnceWith(freeCompanyId, [bobs[1]]);

      await client.query(`UPDATE "User" SET "status" = 'active', "pausedByPlanAt" = NULL WHERE "id" = $1`, [bob]);
      expect(await sync(null)).toEqual({ paused: 0, resumed: 3 });
      expect(await reasons(bobs)).toEqual([null, null, null]);
      expect(await reasons(alices)).toEqual(["disabledByUser", null, null, null]);

      await client.query(`UPDATE "User" SET "status" = 'inactive' WHERE "id" = $1`, [bob]);
      await runWithoutTenant(() => repo().disableRuleUnscoped(freeCompanyId, bobs[2], "ownerInactive"));
      expect(await state(bobs[2])).toEqual({ enabled: false, disabledReason: "ownerInactive" });
    } finally {
      await client.query('DELETE FROM "AutomationRule" WHERE "companyId" = $1', [freeCompanyId]);
      await client.query('DELETE FROM "User" WHERE "companyId" = $1', [freeCompanyId]);
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [freeCompanyId]);
    }
  });

  it("keeps the plan-paused rules of a member who left switched off after the member rejoins", async () => {
    const leaverCompanyId = randomUUID();
    const leaver = randomUUID();
    const colleague = randomUUID();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [leaverCompanyId]);
    for (const [id, status, pausedByPlanAt] of [
      [leaver, "inactive", new Date()],
      [colleague, "inactive", new Date()],
    ] as const) {
      await client.query(
        `INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "status", "pausedByPlanAt", "updatedAt")
         VALUES ($1, $2, 'Rule', 'Owner', $3, $4::"Status", $5, CURRENT_TIMESTAMP)`,
        [id, `rule-${id}@example.invalid`, leaverCompanyId, status, pausedByPlanAt],
      );
    }
    const paused = randomUUID();
    const byUser = randomUUID();
    const colleagues = randomUUID();
    for (const [id, owner] of [
      [paused, leaver],
      [byUser, leaver],
      [colleagues, colleague],
    ] as const)
      await insertRule(id, leaverCompanyId, owner);
    await client.query(
      `UPDATE "AutomationRule" SET "enabled" = FALSE, "disabledReason" = 'planPaused' WHERE "id" = ANY($1)`,
      [[paused, colleagues]],
    );
    await client.query(
      `UPDATE "AutomationRule" SET "enabled" = FALSE, "disabledReason" = 'disabledByUser' WHERE "id" = $1`,
      [byUser],
    );

    try {
      expect(await runWithoutTenant(() => repo().releasePlanPausedOwnerRulesUnscoped(otherCompanyId, leaver))).toBe(0);
      expect(await state(paused)).toEqual({ enabled: false, disabledReason: "planPaused" });
      expect(await runWithoutTenant(() => repo().releasePlanPausedOwnerRulesUnscoped(leaverCompanyId, leaver))).toBe(1);
      expect(await state(paused)).toEqual({ enabled: false, disabledReason: "ownerInactive" });
      expect(await state(byUser)).toEqual({ enabled: false, disabledReason: "disabledByUser" });
      expect(await state(colleagues)).toEqual({ enabled: false, disabledReason: "planPaused" });

      await client.query(`UPDATE "User" SET "status" = 'active', "pausedByPlanAt" = NULL WHERE "companyId" = $1`, [
        leaverCompanyId,
      ]);
      expect(await runWithoutTenant(() => repo(leaverCompanyId).syncRulesToPlanLimitCompanyWide(null))).toEqual({
        paused: 0,
        resumed: 1,
      });
      expect(await state(paused)).toEqual({ enabled: false, disabledReason: "ownerInactive" });
      expect(await state(colleagues)).toEqual({ enabled: true, disabledReason: null });
    } finally {
      await client.query('DELETE FROM "AutomationRule" WHERE "companyId" = $1', [leaverCompanyId]);
      await client.query('DELETE FROM "User" WHERE "companyId" = $1', [leaverCompanyId]);
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [leaverCompanyId]);
    }
  });
});
