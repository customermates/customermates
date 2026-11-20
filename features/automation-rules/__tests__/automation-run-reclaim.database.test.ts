import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { AutomationEffectRunner } = await import("../automation-effect-runner");
const { RunAutomationRuleInteractor } = await import("../run-automation-rule.interactor");
const { createAutomationWorkspace } = await import("./automation-database-fixture");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

describeDatabase("a queued run of a rule that was edited in the meantime", () => {
  it("is skipped as changed when the subscription that matched its event has a newer revision", async () => {
    const w = await createAutomationWorkspace();
    cleanups.push(w.cleanup);
    const deal = await w.createDeal("Acme renewal", "2026-11-20");
    const definition = (name: string) => ({
      name,
      enabled: true,
      ownerUserId: w.admin.id,
      triggerKind: "recordCreated" as const,
      typeId: w.typeId,
      trigger: { kind: "recordCreated" as const, typeId: w.typeId },
      conditions: [],
      effects: [
        {
          kind: "notify",
          recipients: { ruleOwner: true, assignees: false, userIds: [] },
          notificationKind: "ruleAlert",
          title: "New deal",
        },
      ],
    });
    const subscription = (filters: unknown[]) => ({
      typeId: w.typeId,
      events: ["record.created" as const],
      changedFieldIds: [],
      query: { typeId: w.typeId, filters, relationships: [] } as never,
    });
    const rule = await w.as(w.admin, () => w.rules.saveRule(definition("Tell me"), subscription([])));
    const revision = () => runWithoutTenant(() => w.rules.findSubscriptionRevisionUnscoped(w.companyId, rule.id));
    const admit = (occurrenceKey: string, subscriptionRevision: number | null) =>
      runWithoutTenant(() =>
        w.rules.admitRunUnscoped({
          companyId: w.companyId,
          ruleId: rule.id,
          occurrenceKey,
          triggerKind: "recordCreated",
          typeId: w.typeId,
          recordId: deal.recordId,
          payload: { chain: [], subscriptionRevision },
          depth: 0,
          scheduledFor: new Date(),
        }),
      );
    const matched = await revision();
    expect(matched).toEqual(expect.any(Number));
    const outdated = await admit("event:before-the-edit", matched);
    await w.as(w.admin, () =>
      w.rules.saveRule(
        { ...definition("Tell me about named deals"), id: rule.id },
        subscription([{ fieldId: w.nameFieldId, operator: "notEmpty", value: null }]),
      ),
    );
    const edited = await revision();
    expect(edited).not.toBe(matched);
    const current = await admit("event:after-the-edit", edited);
    if (!outdated || !current) throw new Error("expected two admitted runs");

    const notifications = { notify: vi.fn().mockResolvedValue({ created: 1 }) };
    const runner = new AutomationEffectRunner(w.port, notifications, { publish: vi.fn() }, w.rules);
    const interactor = new RunAutomationRuleInteractor(w.rules, runner, w.port);
    await expect(w.as(w.admin, () => interactor.invoke({ runId: outdated }))).resolves.toEqual({
      ok: true,
      data: { status: "skipped" },
    });
    expect(notifications.notify).not.toHaveBeenCalled();
    const skipped = await runWithoutTenant(() =>
      prisma.automationRuleRun.findFirstOrThrow({ where: { companyId: w.companyId, id: outdated } }),
    );
    expect(skipped.outcome).toMatchObject({ reason: "ruleChanged" });
    await expect(w.as(w.admin, () => interactor.invoke({ runId: current }))).resolves.toEqual({
      ok: true,
      data: { status: "applied" },
    });
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });
});

describeDatabase("a run that is reclaimed after its worker died", () => {
  it("counts the field it already set as applied, sends the notification once and ends applied", async () => {
    const w = await createAutomationWorkspace();
    cleanups.push(w.cleanup);
    const deal = await w.createDeal("Acme renewal", "2026-11-20");
    const rule = await w.as(w.admin, () =>
      w.rules.saveRule(
        {
          name: "Mark and tell",
          enabled: true,
          ownerUserId: w.admin.id,
          triggerKind: "dateReached",
          typeId: w.typeId,
          trigger: {
            kind: "dateReached",
            typeId: w.typeId,
            fieldId: w.closesFieldId,
            days: 2,
            direction: "before",
            atHour: 8,
            timezone: "UTC",
          },
          conditions: [{ fieldId: w.nameFieldId, operator: "equals", value: { kind: "text", value: "Acme renewal" } }],
          effects: [
            { kind: "setField", fields: [{ fieldId: w.nameFieldId, value: { kind: "text", value: "Acme renewed" } }] },
            {
              kind: "notify",
              recipients: { ruleOwner: true, assignees: false, userIds: [] },
              notificationKind: "ruleAlert",
              title: "Renewed",
            },
          ],
        },
        null,
      ),
    );
    const runId = await runWithoutTenant(() =>
      w.rules.admitRunUnscoped({
        companyId: w.companyId,
        ruleId: rule.id,
        occurrenceKey: `date:${deal.recordId}:${w.closesFieldId}:2026-11-20:before2`,
        triggerKind: "dateReached",
        typeId: w.typeId,
        recordId: deal.recordId,
        payload: { chain: [] },
        depth: 0,
        scheduledFor: new Date(),
      }),
    );
    if (!runId) throw new Error("expected an admitted run");
    const notifications = { notify: vi.fn().mockResolvedValue({ created: 1 }) };
    const events = { publish: vi.fn().mockResolvedValue(undefined) };
    const runner = new AutomationEffectRunner(w.port, notifications, events, w.rules);
    const interactor = new RunAutomationRuleInteractor(w.rules, runner, w.port);
    const stored = () =>
      runWithoutTenant(() =>
        prisma.automationRuleRun.findFirstOrThrow({ where: { companyId: w.companyId, id: runId } }),
      );

    const saveProgress = w.rules.saveRunProgressUnscoped.bind(w.rules);
    const dying = vi.spyOn(w.rules, "saveRunProgressUnscoped").mockImplementation((companyId, id, outcome) => {
      if ((outcome as { effects: unknown[] }).effects.length > 0) return Promise.reject(new Error("worker died"));
      return saveProgress(companyId, id, outcome);
    });
    await expect(w.as(w.admin, () => interactor.invoke({ runId }))).rejects.toThrow("worker died");
    dying.mockRestore();
    const afterCrash = await w.readDeal(deal);
    expect(afterCrash.fields.find((field) => field.fieldId === w.nameFieldId)?.result).toMatchObject({
      state: "value",
      value: { kind: "text", value: "Acme renewed" },
    });
    expect(notifications.notify).not.toHaveBeenCalled();
    const crashed = await stored();
    expect(crashed.status).toBe("running");
    expect(crashed.outcome).toEqual({ effects: [] });

    await runWithoutTenant(() =>
      prisma.automationRuleRun.updateMany({
        where: { companyId: w.companyId, id: runId },
        data: { startedAt: new Date(Date.now() - 11 * 60 * 1000) },
      }),
    );
    await expect(w.as(w.admin, () => interactor.invoke({ runId }))).resolves.toEqual({
      ok: true,
      data: { status: "applied" },
    });
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect((await w.readDeal(deal)).version).toBe(afterCrash.version);
    expect(await stored()).toMatchObject({
      status: "applied",
      error: null,
      outcome: {
        effects: [
          { kind: "setField", status: "applied" },
          { kind: "notify", status: "applied" },
        ],
      },
    });
  });
});
