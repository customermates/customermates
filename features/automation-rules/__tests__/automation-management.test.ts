import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { Action, Resource } from "@/generated/prisma";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser({
  id: "00000000-0000-4000-8000-000000000010",
  companyId: "00000000-0000-4000-8000-000000000011",
});

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import type { CalculatedValue } from "@/features/records/record-model.schema";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { AutomationPlanLimitsAdapter } from "../automation-plan-limits";
import { DeleteAutomationRuleInteractor } from "../delete-automation-rule.interactor";
import { GetAutomationRuleRunsInteractor } from "../get-automation-rule-runs.interactor";
import { GetAutomationRulesInteractor } from "../get-automation-rules.interactor";
import { PreviewAutomationRuleInteractor } from "../preview-automation-rule.interactor";
import { SetAutomationRuleEnabledInteractor } from "../set-automation-rule-enabled.interactor";
import { UpsertAutomationRuleInteractor } from "../upsert-automation-rule.interactor";
import { FakeAutomationRuleRepo } from "./fake-automation-rule-repo";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const OWNER = "00000000-0000-4000-8000-000000000010";
const COLLEAGUE = "00000000-0000-4000-8000-000000000012";
const RULE = "00000000-0000-4000-8000-0000000000a1";
const DEALS = "11111111-1111-4111-8111-111111111111";
const TASKS = "11111111-1111-4111-8111-222222222222";
const STAGE = "22222222-2222-4222-8222-222222222222";
const CLOSE = "22222222-2222-4222-8222-333333333333";
const TITLE = "22222222-2222-4222-8222-444444444444";
const TASK_DUE = "22222222-2222-4222-8222-555555555555";
const CALC = "22222222-2222-4222-8222-666666666666";
const RELATION = "55555555-5555-4555-8555-555555555555";
const RECORD = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-11-12T08:00:00.000Z");

function field(id: string, typeId: string, valueType: string, kind = "input") {
  return { id, typeId, label: id, valueType, behavior: { kind }, archived: false, required: false, options: [] };
}

const MODEL = {
  revision: 4,
  types: [
    { id: DEALS, label: "Deal", archived: false, primaryFieldId: null },
    { id: TASKS, label: "Action", archived: false, primaryFieldId: TITLE },
  ],
  fields: [
    field(STAGE, DEALS, "select"),
    field(CLOSE, DEALS, "date"),
    field(CALC, DEALS, "number", "formula"),
    field(TITLE, TASKS, "text"),
    field(TASK_DUE, TASKS, "date"),
  ],
  relationships: [{ id: RELATION, sourceTypeId: TASKS, targetTypeId: DEALS, archived: false }],
};

const notify = { kind: "notify", recipients: { ruleOwner: true }, title: "Closing: {{record.name}}" };
const reminder = {
  name: "Closing reminder",
  trigger: {
    kind: "dateReached",
    typeId: DEALS,
    fieldId: CLOSE,
    days: 2,
    direction: "before",
    timezone: "Europe/Berlin",
  },
  effects: [notify],
};

function unlimited() {
  return { activeRuleAllowance: vi.fn().mockResolvedValue({ limit: null, price: "" }) };
}

function allowance(limit: number) {
  return { activeRuleAllowance: vi.fn().mockResolvedValue({ limit, price: "€12" }) };
}

function recordsPort() {
  return {
    model: vi.fn().mockResolvedValue(MODEL),
    read: vi.fn().mockResolvedValue(null),
    mutate: vi.fn(),
  };
}

function issueOf(result: {
  ok: boolean;
  error?: { issues: Array<{ path: PropertyKey[]; params?: Record<string, unknown> }> };
}) {
  const issue = result.error?.issues[0];
  return { path: issue?.path, error: issue?.params?.error };
}

describe("saving a rule", () => {
  let repo: FakeAutomationRuleRepo;
  beforeEach(() => {
    repo = new FakeAutomationRuleRepo();
  });

  const upsert = (limits = unlimited()) => new UpsertAutomationRuleInteractor(repo, recordsPort() as never, limits);
  const save = (instance: UpsertAutomationRuleInteractor, input: unknown, user = mockUser) =>
    runWithTenant(user, () => instance.invoke(input as never));

  it("creates a live rule owned by the caller and reports it back", async () => {
    const result = await save(upsert(), reminder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ name: "Closing reminder", enabled: true, ownerUserId: OWNER });
    expect(result.data.trigger).toMatchObject({ kind: "dateReached", atHour: 8, timezone: "Europe/Berlin" });
    expect([...repo.rules.values()][0]).toMatchObject({
      triggerKind: "dateReached",
      typeId: DEALS,
      ownerUserId: OWNER,
    });
  });

  it("refuses a rule that points at a field or relation the workspace does not have", async () => {
    const missing = "99999999-9999-4999-8999-999999999999";
    for (const [input, path] of [
      [{ ...reminder, trigger: { ...reminder.trigger, fieldId: STAGE } }, ["trigger", "fieldId"]],
      [{ ...reminder, trigger: { ...reminder.trigger, typeId: missing } }, ["trigger", "typeId"]],
      [{ ...reminder, conditions: [{ fieldId: TITLE, operator: "empty" }] }, ["conditions", "0", "fieldId"]],
      [
        {
          ...reminder,
          effects: [{ kind: "setField", fields: [{ fieldId: CALC, value: { kind: "text", value: "x" } }] }],
        },
        ["effects", "0", "fields", "0", "fieldId"],
      ],
      [
        {
          ...reminder,
          effects: [{ kind: "createRecord", typeId: TASKS, link: { relationId: RELATION, direction: "incoming" } }],
        },
        ["effects", "0", "link", "relationId"],
      ],
    ] as const) {
      const result = await save(upsert(), input);
      expect(result.ok).toBe(false);
      expect(issueOf(result as never)).toEqual({ path, error: CustomErrorCode.automationRuleInvalid });
    }
    expect(repo.rules.size).toBe(0);
  });

  it("accepts a task effect linked to the deal through the declared relation", async () => {
    const result = await save(upsert(), {
      ...reminder,
      effects: [
        {
          kind: "createRecord",
          typeId: TASKS,
          title: { fieldId: TITLE, text: "Call {{record.name}}" },
          due: { fieldId: TASK_DUE, offsetDays: 1 },
          link: { relationId: RELATION, direction: "outgoing" },
        },
        notify,
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("stops at the plan's allowance of active rules but still saves a draft", async () => {
    repo.addRule({ id: RULE, trigger: reminder.trigger, effects: [notify] });
    const limited = upsert(allowance(1));
    const refused = await save(limited, reminder);
    expect(refused.ok).toBe(false);
    expect(issueOf(refused as never).error).toBe(CustomErrorCode.automationRuleLimitReached);
    expect(repo.rules.size).toBe(1);
    const draft = await save(limited, { ...reminder, enabled: false });
    expect(draft.ok).toBe(true);
    expect(repo.rules.size).toBe(2);
  });

  it("does not count the rule being edited against the allowance", async () => {
    repo.addRule({ id: RULE, trigger: reminder.trigger, effects: [notify] });
    const result = await save(upsert(allowance(1)), { id: RULE, name: "Renamed" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.name).toBe("Renamed");
  });

  it("keeps the untouched parts of a rule when it is updated", async () => {
    await save(upsert(), reminder);
    const [stored] = [...repo.rules.values()];
    const result = await save(upsert(), { id: stored?.id, trigger: { ...reminder.trigger, days: 5 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trigger).toMatchObject({ days: 5 });
    expect(result.data.effects).toHaveLength(1);
    expect(result.data.name).toBe("Closing reminder");
  });

  it("lets only the owner change a rule", async () => {
    repo.addRule({ id: RULE, trigger: reminder.trigger, effects: [notify], ownerUserId: COLLEAGUE });
    const result = await save(upsert(), { id: RULE, name: "Mine now" });
    expect(result.ok).toBe(false);
    expect(issueOf(result as never).error).toBe(CustomErrorCode.automationRuleEditNotOwner);
    expect(repo.rules.get(RULE)?.name).toBe("Rule");
    const missing = await save(upsert(), { id: "00000000-0000-4000-8000-0000000000ff", name: "x" });
    expect(missing.ok).toBe(false);
  });

  it("needs the routines permission to create", async () => {
    const reader = {
      ...createMockUserWithPermissions([{ resource: Resource.routines, action: Action.readAll }]),
      id: OWNER,
      companyId: COMPANY,
    };
    await expect(save(upsert(), reminder, reader)).rejects.toThrow(/Access denied/);
    const writer = {
      ...createMockUserWithPermissions([{ resource: Resource.routines, action: Action.create }]),
      id: OWNER,
      companyId: COMPANY,
    };
    await expect(save(upsert(), reminder, writer)).resolves.toMatchObject({ ok: true });
  });
});

describe("switching a rule on and off", () => {
  let repo: FakeAutomationRuleRepo;
  beforeEach(() => {
    repo = new FakeAutomationRuleRepo();
  });

  const toggle = (limits = unlimited()) => new SetAutomationRuleEnabledInteractor(repo, limits);
  const set = (
    instance: SetAutomationRuleEnabledInteractor,
    input: { id: string; enabled: boolean },
    user = mockUser,
  ) => runWithTenant(user, () => instance.invoke(input as never));

  it("lets the owner switch it off and on again", async () => {
    repo.addRule({ id: RULE, trigger: reminder.trigger, effects: [notify] });
    const off = await set(toggle(), { id: RULE, enabled: false });
    expect(off).toMatchObject({ ok: true, data: { enabled: false, disabledReason: "disabledByUser" } });
    const on = await set(toggle(), { id: RULE, enabled: true });
    expect(on).toMatchObject({ ok: true, data: { enabled: true, disabledReason: null } });
  });

  it("checks the allowance when a rule is switched on", async () => {
    repo.addRule({ id: RULE, trigger: reminder.trigger, effects: [notify], enabled: false });
    repo.addRule({ id: "00000000-0000-4000-8000-0000000000a2", trigger: reminder.trigger, effects: [notify] });
    const refused = await set(toggle(allowance(1)), { id: RULE, enabled: true });
    expect(refused.ok).toBe(false);
    expect(issueOf(refused as never).error).toBe(CustomErrorCode.automationRuleLimitReached);
    expect((await set(toggle(allowance(2)), { id: RULE, enabled: true })).ok).toBe(true);
  });

  it("lets an administrator switch off but not on another member's rule", async () => {
    repo.addRule({ id: RULE, trigger: reminder.trigger, effects: [notify], ownerUserId: COLLEAGUE });
    expect((await set(toggle(), { id: RULE, enabled: true })).ok).toBe(false);
    expect((await set(toggle(), { id: RULE, enabled: false })).ok).toBe(true);
    const member = {
      ...createMockUserWithPermissions([{ resource: Resource.routines, action: Action.update }]),
      id: OWNER,
      companyId: COMPANY,
    };
    repo.addRule({ id: RULE, trigger: reminder.trigger, effects: [notify], ownerUserId: COLLEAGUE });
    const refused = await set(toggle(), { id: RULE, enabled: false }, member);
    expect(refused.ok).toBe(false);
    expect(issueOf(refused as never).error).toBe(CustomErrorCode.automationRuleAdminRequired);
  });

  it("deletes a rule for its owner or an administrator and reports an unknown one", async () => {
    const remove = new DeleteAutomationRuleInteractor(repo);
    const run = (id: string, user = mockUser) => runWithTenant(user, () => remove.invoke({ id }));
    repo.addRule({ id: RULE, trigger: reminder.trigger, effects: [notify], ownerUserId: COLLEAGUE });
    await expect(run(RULE)).resolves.toEqual({ ok: true, data: { deleted: true, id: RULE } });
    expect(repo.rules.size).toBe(0);
    expect((await run(RULE)).ok).toBe(false);
    repo.addRule({ id: RULE, trigger: reminder.trigger, effects: [notify], ownerUserId: COLLEAGUE });
    const member = {
      ...createMockUserWithPermissions([{ resource: Resource.routines, action: Action.delete }]),
      id: OWNER,
      companyId: COMPANY,
    };
    expect((await run(RULE, member)).ok).toBe(false);
    expect(repo.rules.size).toBe(1);
  });
});

describe("reading rules", () => {
  let repo: FakeAutomationRuleRepo;
  beforeEach(() => {
    repo = new FakeAutomationRuleRepo();
    repo.addRule({ id: RULE, trigger: reminder.trigger, effects: [notify], typeId: DEALS, ownerUserId: OWNER });
    repo.addRule({
      id: "00000000-0000-4000-8000-0000000000a2",
      trigger: { kind: "recordCreated", typeId: TASKS },
      effects: [notify],
      typeId: TASKS,
      ownerUserId: COLLEAGUE,
    });
  });

  it("lists every rule, narrowed by list or owner", async () => {
    const list = new GetAutomationRulesInteractor(repo);
    const run = (input: Record<string, unknown>, user = mockUser) =>
      runWithTenant(user, () => list.invoke(input as never));
    await expect(run({})).resolves.toMatchObject({ ok: true, data: { total: 2 } });
    await expect(run({ typeId: TASKS })).resolves.toMatchObject({ ok: true, data: { total: 1 } });
    await expect(run({ owner: "mine" })).resolves.toMatchObject({ ok: true, data: { total: 1 } });
    const own = {
      ...createMockUserWithPermissions([{ resource: Resource.routines, action: Action.readOwn }]),
      id: OWNER,
      companyId: COMPANY,
    };
    await expect(run({}, own)).resolves.toMatchObject({ ok: true, data: { total: 1 } });
  });

  it("shows the run history of a visible rule only", async () => {
    await repo.admitRunUnscoped({
      companyId: COMPANY,
      ruleId: RULE,
      occurrenceKey: "event:1",
      triggerKind: "recordCreated",
      typeId: DEALS,
      recordId: RECORD,
      payload: null,
      depth: 0,
      scheduledFor: NOW,
    });
    const runs = new GetAutomationRuleRunsInteractor(repo);
    const run = (id: string, user = mockUser) => runWithTenant(user, () => runs.invoke({ id } as never));
    await expect(run(RULE)).resolves.toMatchObject({
      ok: true,
      data: { total: 1, items: [{ ruleId: RULE, effects: [] }] },
    });
    const own = {
      ...createMockUserWithPermissions([{ resource: Resource.routines, action: Action.readOwn }]),
      id: COLLEAGUE,
      companyId: COMPANY,
    };
    expect((await run(RULE, own)).ok).toBe(false);
    expect((await run("00000000-0000-4000-8000-0000000000ff")).ok).toBe(false);
  });
});

describe("previewing a date rule", () => {
  let repo: FakeAutomationRuleRepo;
  beforeEach(() => {
    repo = new FakeAutomationRuleRepo();
  });

  function preview(record: { values: Map<string, CalculatedValue> } | null = null) {
    const records = recordsPort();
    records.read.mockResolvedValue(record);
    return new PreviewAutomationRuleInteractor(repo, records as never, () => NOW);
  }
  const run = (instance: PreviewAutomationRuleInteractor, input: unknown) =>
    runWithTenant(mockUser, () => instance.invoke(input as never));

  it("counts the records the rule would hit on its first sweep", async () => {
    repo.candidates = [
      { recordId: RECORD, fieldValue: "2026-11-14" },
      { recordId: "44444444-4444-4444-8444-444444444445", fieldValue: "2026-11-13" },
      { recordId: "44444444-4444-4444-8444-444444444446", fieldValue: "2026-11-25" },
    ];
    const result = await run(preview(), { rule: { trigger: reminder.trigger } });
    expect(result).toMatchObject({ ok: true, data: { supported: true, total: 2, alreadyFired: 0 } });
  });

  it("leaves out records that already fired and records that miss a condition", async () => {
    const stored = repo.addRule({
      id: RULE,
      trigger: reminder.trigger,
      effects: [notify],
      triggerKind: "dateReached",
      typeId: DEALS,
    });
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-14" }];
    await repo.admitRunUnscoped({
      companyId: COMPANY,
      ruleId: stored.id,
      occurrenceKey: `date:${RECORD}:${CLOSE}:2026-11-14:before2`,
      triggerKind: "dateReached",
      typeId: DEALS,
      recordId: RECORD,
      payload: null,
      depth: 0,
      scheduledFor: NOW,
    });
    await expect(run(preview(), { id: RULE })).resolves.toMatchObject({
      ok: true,
      data: { total: 0, alreadyFired: 1 },
    });
    const lost = new Map<string, CalculatedValue>([
      [STAGE, { state: "value", value: { kind: "select", value: "lost" } }],
    ]);
    const filtered = await run(preview({ values: lost }), {
      rule: {
        trigger: reminder.trigger,
        conditions: [{ fieldId: STAGE, operator: "equals", value: { kind: "select", value: "won" } }],
      },
    });
    expect(filtered).toMatchObject({ ok: true, data: { total: 0 } });
  });

  it("says plainly that other triggers have nothing to preview", async () => {
    const result = await run(preview(), { rule: { trigger: { kind: "recordCreated", typeId: DEALS } } });
    expect(result).toMatchObject({ ok: true, data: { supported: false, total: 0 } });
    expect((await run(preview(), { id: "00000000-0000-4000-8000-0000000000ff" })).ok).toBe(false);
    expect((await run(preview(), {})).ok).toBe(false);
  });
});

describe("plan allowance", () => {
  const adapter = (plan: Parameters<typeof allowanceFor>[0]) => allowanceFor(plan);
  function allowanceFor(plan: "free" | "starter" | "pro" | "business" | "max" | "enterprise" | null) {
    return new AutomationPlanLimitsAdapter({ plan: () => Promise.resolve({ plan }) }, (target) =>
      Promise.resolve({ price: `price:${target}` }),
    );
  }

  it("allows three active rules on Free and twenty on Starter and points at the next plan", async () => {
    await expect(adapter("free").activeRuleAllowance()).resolves.toEqual({ limit: 3, price: "price:starter" });
    await expect(adapter("starter").activeRuleAllowance()).resolves.toEqual({ limit: 20, price: "price:pro" });
  });

  it("does not limit Pro, Business, Max, Enterprise or an instance without a plan", async () => {
    for (const plan of ["pro", "business", "max", "enterprise", null] as const)
      await expect(adapter(plan).activeRuleAllowance()).resolves.toEqual({ limit: null, price: "" });
  });
});
