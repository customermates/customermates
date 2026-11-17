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
  const NOW = new Date("2026-11-18T09:00:00.000Z");
  const CLOSES = "2026-11-20";

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

    const history = new GetAutomationRuleRunsInteractor(w.rules);
    const page = await w.as(member, () => history.invoke({ id: rule.id } as never));
    if (!page.ok) throw new Error("expected the run history");
    expect(page.data.runs.map((run) => run.recordId)).toEqual([own.recordId]);
    expect(page.data.runs[0].occurrenceKey).toBe(`date:${own.recordId}:${w.closesFieldId}:before2`);
    const shown = JSON.stringify([plain, conditional, page]);
    expect(shown).not.toContain(foreign.recordId);
    expect(JSON.stringify(page)).not.toContain(CLOSES);
  });
});
