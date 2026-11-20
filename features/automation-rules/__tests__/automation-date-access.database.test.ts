import type { TenantUser } from "@/features/user/user.schema";

import { afterAll, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
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
const { DiscardAutomationRuleRunInteractor } = await import("../discard-automation-rule-run.interactor");
const { GetAutomationRuleRunsInteractor } = await import("../get-automation-rule-runs.interactor");
const { PreviewAutomationRuleInteractor } = await import("../preview-automation-rule.interactor");
const { SweepAutomationRulesInteractor } = await import("../sweep-automation-rules.interactor");
const { createAutomationWorkspace } = await import("./automation-database-fixture");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const cleanups: Array<() => Promise<unknown>> = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
});

describeDatabase("a date rule of a member who reads only their own records", () => {
  const NOW = new Date("2031-03-12T09:00:00.000Z");
  const CLOSES = "2031-03-14";

  it("gives no foreign record id or date in the preview, the sweep or the run history", async () => {
    const w = await createAutomationWorkspace();
    cleanups.push(w.cleanup);
    await w.grant("deal", ["create", "readOwn"]);
    const member = w.automationUser(w.member);
    const foreign = await w.createDeal("Foreign deal", CLOSES);
    const own = await w.createDeal("Member deal", CLOSES, w.member);
    const trigger = {
      kind: "dateReached" as const,
      typeId: w.typeId,
      fieldId: w.closesFieldId,
      days: 2,
      direction: "before" as const,
      atHour: 8,
      timezone: "Europe/Berlin",
    };

    const preview = new PreviewAutomationRuleInteractor(w.rules, w.port, w.candidates, () => NOW);
    const plain = await w.as(member, () => preview.invoke({ rule: { trigger } } as never));
    expect(plain).toMatchObject({ ok: true, data: { supported: true, total: 1, recordIds: [own.recordId] } });
    const conditional = await w.as(member, () =>
      preview.invoke({
        rule: { trigger, conditions: [{ fieldId: w.nameFieldId, operator: "notEmpty" }] },
      } as never),
    );
    expect(conditional).toMatchObject({ ok: true, data: { total: 1, recordIds: [own.recordId] } });
    const everything = await w.as(w.admin, () => preview.invoke({ rule: { trigger } } as never));
    expect(everything).toMatchObject({ ok: true, data: { total: 2 } });

    const rule = await w.as(member, () =>
      w.rules.saveRule(
        {
          name: "Remind me before a deal closes",
          enabled: true,
          ownerUserId: member.id,
          triggerKind: "dateReached",
          typeId: w.typeId,
          trigger,
          conditions: [],
          effects: [{ kind: "notify", recipients: { ruleOwner: true }, title: "Closes soon" }],
        },
        null,
      ),
    );
    const everyDateRule = w.rules.findDateRulesUnscoped.bind(w.rules);
    vi.spyOn(w.rules, "findDateRulesUnscoped").mockImplementation(async (args) =>
      (await everyDateRule(args)).filter((candidate) => candidate.companyId === w.companyId),
    );
    vi.spyOn(w.rules, "findStaleRunsUnscoped").mockResolvedValue([]);
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const sweep = new SweepAutomationRulesInteractor(
      w.rules,
      w.candidates,
      { dispatch } as never,
      new DiscardAutomationRuleRunInteractor(w.rules, () => NOW),
    );
    await runWithoutTenant(() => sweep.invoke(NOW));
    const stored = await runWithoutTenant(() =>
      prisma.automationRuleRun.findMany({ where: { companyId: w.companyId, ruleId: rule.id } }),
    );
    expect(stored.map((run) => run.recordId)).toEqual([own.recordId]);
    expect(stored[0].occurrenceKey).toContain(CLOSES);

    const history = new GetAutomationRuleRunsInteractor(w.rules, w.candidates);
    const page = await w.as(member, () => history.invoke({ id: rule.id } as never));
    if (!page.ok) throw new Error("expected the run history");
    expect(page.data.runs.map((run) => run.recordId)).toEqual([own.recordId]);
    expect(page.data.runs[0].occurrenceKey).toBe(`date:${own.recordId}:${w.closesFieldId}:before2`);
    const shown = JSON.stringify([plain, conditional, page]);
    expect(shown).not.toContain(foreign.recordId);
    expect(JSON.stringify(page)).not.toContain(CLOSES);
  });
});

describeDatabase("the run history read by a member who reads every automation but only their own records", () => {
  const DUE = new Date("2031-03-12T07:00:00.000Z");
  const CLOSES = "2031-03-14";

  it("gives a foreign record's run without the record, its id in the key or the due time of its date", async () => {
    const w = await createAutomationWorkspace();
    cleanups.push(w.cleanup);
    await w.grant("deal", ["create", "readOwn"]);
    const reader = {
      ...w.member,
      role: {
        ...w.member.role,
        permissions: [{ id: "automation-read-all", resource: Resource.routines, action: Action.readAll }],
      },
    } as TenantUser;
    const foreign = await w.createDeal("Foreign deal", CLOSES);
    const own = await w.createDeal("Member deal", CLOSES, w.member);
    const rule = await w.as(w.admin, () =>
      w.rules.saveRule(
        {
          name: "Remind the owner before a deal closes",
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
            timezone: "Europe/Berlin",
          },
          conditions: [],
          effects: [{ kind: "notify", recipients: { ruleOwner: true }, title: "Closes soon" }],
        },
        null,
      ),
    );
    const dateKey = (recordId: string) => `date:${recordId}:${w.closesFieldId}:${CLOSES}:before2`;
    const admit = (recordId: string, triggerKind: "dateReached" | "recordCreated", occurrenceKey: string) =>
      runWithoutTenant(() =>
        w.rules.admitRunUnscoped({
          companyId: w.companyId,
          ruleId: rule.id,
          occurrenceKey,
          triggerKind,
          typeId: w.typeId,
          recordId,
          payload: null,
          depth: 0,
          scheduledFor: DUE,
        }),
      );
    const foreignDateRun = await admit(foreign.recordId, "dateReached", dateKey(foreign.recordId));
    const ownDateRun = await admit(own.recordId, "dateReached", dateKey(own.recordId));
    const foreignEventRun = await admit(foreign.recordId, "recordCreated", "event:foreign-created");

    const history = new GetAutomationRuleRunsInteractor(w.rules, w.candidates);
    const page = await w.as(reader, () => history.invoke({ id: rule.id } as never));
    if (!page.ok) throw new Error("expected the run history");
    const shown = Object.fromEntries(
      page.data.runs.map((run) => [run.id, [run.recordId, run.occurrenceKey, run.scheduledFor]]),
    );
    expect(shown).toEqual({
      [String(foreignDateRun)]: [null, "date", null],
      [String(ownDateRun)]: [own.recordId, `date:${own.recordId}:${w.closesFieldId}:before2`, DUE.toISOString()],
      [String(foreignEventRun)]: [null, "event:foreign-created", DUE.toISOString()],
    });
    expect(JSON.stringify(page)).not.toContain(foreign.recordId);

    const everything = await w.as(w.admin, () => history.invoke({ id: rule.id } as never));
    if (!everything.ok) throw new Error("expected the run history");
    expect(everything.data.runs.map((run) => run.recordId).sort()).toEqual(
      [foreign.recordId, foreign.recordId, own.recordId].sort(),
    );
    expect(everything.data.runs.every((run) => run.scheduledFor === DUE.toISOString())).toBe(true);
  });
});
