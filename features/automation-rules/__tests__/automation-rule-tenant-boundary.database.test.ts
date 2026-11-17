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
    await runWithoutTenant(() => repo().settleRunUnscoped({ ...settlement, companyId: otherCompanyId }));
    expect((await client.query('SELECT "status" FROM "AutomationRuleRun" WHERE "id" = $1', [runId])).rows[0]).toEqual({
      status: "running",
    });
    expect(await state(ruleId)).toEqual({ enabled: true, disabledReason: null });
    await runWithoutTenant(() => repo().settleRunUnscoped({ ...settlement, companyId }));
    expect((await client.query('SELECT "status" FROM "AutomationRuleRun" WHERE "id" = $1', [runId])).rows[0]).toEqual({
      status: "applied",
    });
    expect(
      (await client.query('SELECT "lastRunStatus" FROM "AutomationRule" WHERE "id" = $1', [ruleId])).rows[0],
    ).toEqual({ lastRunStatus: "applied" });
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

  // Finding 1 of the review of 2026-11-17: Bob owns the three oldest rules and is paused by the downgrade,
  // Alice is the member the Free plan keeps. Bob's rules must not hold the three Free slots.
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

      // Alice switches one of her rules off: the freed slot goes to her paused rule, never to Bob's.
      await client.query(
        `UPDATE "AutomationRule" SET "enabled" = FALSE, "disabledReason" = 'disabledByUser' WHERE "id" = $1`,
        [alices[0]],
      );
      expect(await sync(3)).toEqual({ paused: 0, resumed: 1 });
      expect(await reasons(alices)).toEqual(["disabledByUser", null, null, null]);
      expect(await reasons(bobs)).toEqual(["planPaused", "planPaused", "planPaused"]);

      // A run of Bob's rule that was queued before the pause finds its owner inactive. That must not turn
      // the plan pause into "ownerInactive", which no resume restores.
      await runWithoutTenant(() => repo().disableRuleUnscoped(freeCompanyId, bobs[0], "ownerInactive"));
      expect(await state(bobs[0])).toEqual({ enabled: false, disabledReason: "planPaused" });
      // The same run arriving between the member pause and the rule sync, while the rule is still on.
      await client.query(`UPDATE "AutomationRule" SET "enabled" = TRUE, "disabledReason" = NULL WHERE "id" = $1`, [
        bobs[1],
      ]);
      await runWithoutTenant(() => repo().disableRuleUnscoped(freeCompanyId, bobs[1], "ownerInactive"));
      expect(await state(bobs[1])).toEqual({ enabled: false, disabledReason: "planPaused" });

      // The upgrade resumes Bob, and the plan gives back exactly what it paused.
      await client.query(`UPDATE "User" SET "status" = 'active', "pausedByPlanAt" = NULL WHERE "id" = $1`, [bob]);
      expect(await sync(null)).toEqual({ paused: 0, resumed: 3 });
      expect(await reasons(bobs)).toEqual([null, null, null]);
      expect(await reasons(alices)).toEqual(["disabledByUser", null, null, null]);

      // An owner an administrator deactivated is still released as before.
      await client.query(`UPDATE "User" SET "status" = 'inactive' WHERE "id" = $1`, [bob]);
      await runWithoutTenant(() => repo().disableRuleUnscoped(freeCompanyId, bobs[2], "ownerInactive"));
      expect(await state(bobs[2])).toEqual({ enabled: false, disabledReason: "ownerInactive" });
    } finally {
      await client.query('DELETE FROM "AutomationRule" WHERE "companyId" = $1', [freeCompanyId]);
      await client.query('DELETE FROM "User" WHERE "companyId" = $1', [freeCompanyId]);
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [freeCompanyId]);
    }
  });
});
