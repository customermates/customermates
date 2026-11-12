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
import type { AutomationRecordView } from "../automation-ports";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { AutomationEffectRunner } from "../automation-effect-runner";
import { AutomationRuleAdmission } from "../automation-rule-admission";
import { currentAutomationChain } from "../automation-context";
import { DiscardAutomationRuleRunInteractor } from "../discard-automation-rule-run.interactor";
import { RunAutomationRuleInteractor } from "../run-automation-rule.interactor";
import { SweepAutomationRulesInteractor } from "../sweep-automation-rules.interactor";
import { FakeAutomationRuleRepo } from "./fake-automation-rule-repo";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const OWNER = "00000000-0000-4000-8000-000000000010";
const OTHER_USER = "00000000-0000-4000-8000-000000000012";
const RULE = "00000000-0000-4000-8000-0000000000a1";
const RULE_B = "00000000-0000-4000-8000-0000000000a2";
const TYPE = "11111111-1111-4111-8111-111111111111";
const TASKS = "11111111-1111-4111-8111-222222222222";
const RECORD = "44444444-4444-4444-8444-444444444444";
const STAGE = "22222222-2222-4222-8222-222222222222";
const TITLE = "22222222-2222-4222-8222-333333333333";
const DUE = "22222222-2222-4222-8222-444444444444";
const NEXT_STEP = "22222222-2222-4222-8222-555555555555";
const RELATION = "55555555-5555-4555-8555-555555555555";
const WEBHOOK = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-11-12T08:00:00.000Z");

const notify = { kind: "notify", recipients: { ruleOwner: true }, title: "Look at {{record.name}}" };

function view(overrides: Partial<AutomationRecordView> = {}): AutomationRecordView {
  return {
    ref: { typeId: TYPE, recordId: RECORD },
    version: 3,
    name: "Acme",
    assignedUserIds: [OTHER_USER],
    values: new Map<string, CalculatedValue>([[STAGE, { state: "value", value: { kind: "select", value: "won" } }]]),
    ...overrides,
  };
}

function ports(record: AutomationRecordView | null = view()) {
  const records = {
    model: vi.fn().mockResolvedValue({
      revision: 1,
      types: [],
      fields: [
        { id: DUE, typeId: TASKS, valueType: "date" },
        { id: NEXT_STEP, typeId: TASKS, valueType: "dateTime" },
      ],
      relationships: [],
    }),
    read: vi.fn().mockResolvedValue(record),
    mutate: vi.fn().mockResolvedValue({ ok: true, refs: [{ typeId: TASKS, recordId: "created" }] }),
  };
  const notifications = { notify: vi.fn().mockResolvedValue({ created: 2 }) };
  const webhooks = { send: vi.fn().mockResolvedValue({ sent: true, statusCode: 200 }) };
  return { records, notifications, webhooks, runner: new AutomationEffectRunner(records as never, notifications, webhooks) };
}

function context(trigger: Record<string, unknown> = { kind: "recordCreated", typeId: TYPE }) {
  return {
    companyId: COMPANY,
    runId: "run-00000001",
    rule: { id: RULE, name: "Follow up", ownerUserId: OWNER, trigger: trigger as never },
    recordRef: { typeId: TYPE, recordId: RECORD },
    now: NOW,
  };
}

describe("automation effects", () => {
  it("sets fields on the triggering record at its current version, once per run", async () => {
    const { records, runner } = ports();
    const fields = [{ fieldId: STAGE, value: { kind: "select" as const, value: "lost" } }];
    const { outcomes, failure } = await runner.run([{ kind: "setField", fields }], context());
    expect(failure).toBeNull();
    expect(outcomes).toEqual([{ kind: "setField", status: "applied", recordRef: { typeId: TYPE, recordId: RECORD } }]);
    expect(records.mutate).toHaveBeenCalledWith({
      idempotencyKey: "rule:run-00000001:0",
      mutation: { action: "update", ref: { typeId: TYPE, recordId: RECORD }, expectedVersion: 3, fields },
    });
  });

  it("skips a record effect when the record cannot be read", async () => {
    const { records, runner } = ports(null);
    const { outcomes } = await runner.run([{ kind: "setField", fields: [{ fieldId: STAGE, value: null }] }], context());
    expect(outcomes).toEqual([{ kind: "setField", status: "skipped", detail: "recordMissing" }]);
    expect(records.mutate).not.toHaveBeenCalled();
  });

  it("creates a task with a rendered title, a due date from the rule's zone, an assignee and a link", async () => {
    const { records, runner } = ports();
    const effect = {
      kind: "createRecord" as const,
      typeId: TASKS,
      title: { fieldId: TITLE, text: "Call {{record.name}} ({{rule.name}})" },
      due: { fieldId: DUE, offsetDays: 2 },
      fields: [],
      assignToRuleOwner: true,
      assignedUserIds: [OTHER_USER, OWNER],
      link: { relationId: RELATION, direction: "outgoing" as const },
    };
    const trigger = { kind: "dateReached", typeId: TYPE, fieldId: STAGE, days: 1, direction: "before", atHour: 8, timezone: "Asia/Tokyo" };
    const { outcomes } = await runner.run([effect], context(trigger));
    expect(outcomes[0]).toMatchObject({ kind: "createRecord", status: "applied", recordRef: { recordId: "created" } });
    const call = records.mutate.mock.calls[0]?.[0] as { idempotencyKey: string; mutation: Record<string, unknown> };
    expect(call.idempotencyKey).toBe("rule:run-00000001:0");
    expect(call.mutation).toMatchObject({
      action: "create",
      typeId: TASKS,
      assignedUserIds: [OTHER_USER, OWNER],
      links: [{ relationId: RELATION, direction: "outgoing", record: { typeId: TYPE, recordId: RECORD } }],
    });
    expect(call.mutation.fields).toEqual([
      { fieldId: TITLE, value: { kind: "text", value: "Call Acme (Follow up)" } },
      { fieldId: DUE, value: { kind: "date", value: "2026-11-14" } },
    ]);
  });

  it("gives a date and time due field a moment two days from now", async () => {
    const { records, runner } = ports();
    await runner.run(
      [{ kind: "createRecord", typeId: TASKS, due: { fieldId: NEXT_STEP, offsetDays: 2 }, fields: [], assignToRuleOwner: false, assignedUserIds: [] }],
      context(),
    );
    const call = records.mutate.mock.calls[0]?.[0] as { mutation: { fields: unknown[] } };
    expect(call.mutation.fields).toEqual([
      { fieldId: NEXT_STEP, value: { kind: "dateTime", value: "2026-11-14T08:00:00.000Z" } },
    ]);
  });

  it("notifies the owner and the assignees once each, with the record name filled in", async () => {
    const { notifications, runner } = ports();
    const effect = {
      kind: "notify" as const,
      recipients: { ruleOwner: true, assignees: true, userIds: [OWNER] },
      notificationKind: "dueToday" as const,
      title: "Due: {{record.name}}",
      body: "{{rule.name}}",
    };
    const { outcomes } = await runner.run([effect], context());
    expect(outcomes).toEqual([{ kind: "notify", status: "applied", detail: "2" }]);
    expect(notifications.notify).toHaveBeenCalledWith({
      companyId: COMPANY,
      recipients: [OWNER, OTHER_USER],
      kind: "dueToday",
      title: "Due: Acme",
      body: "Follow up",
      href: `/records/${TYPE}/${RECORD}`,
      sourceRuleId: RULE,
      dedupeKey: "rule:run-00000001:0",
    });
  });

  it("skips a notification that has nobody to tell", async () => {
    const { notifications, runner } = ports(view({ assignedUserIds: [] }));
    const effect = { kind: "notify" as const, recipients: { assignees: true }, title: "x" };
    const { outcomes } = await runner.run([{ ...effect, recipients: { ruleOwner: false, assignees: true, userIds: [] }, notificationKind: "ruleAlert" }], context());
    expect(outcomes).toEqual([{ kind: "notify", status: "skipped", detail: "noRecipients" }]);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it("calls an outbound webhook and reports each refusal", async () => {
    const { webhooks, runner } = ports();
    const effect = { kind: "callWebhook" as const, webhookId: WEBHOOK };
    expect((await runner.run([effect], context())).outcomes[0]).toMatchObject({ status: "applied", detail: "200" });
    expect(webhooks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: COMPANY,
        webhookId: WEBHOOK,
        deliveryId: "rule-run-00000001",
        payload: expect.objectContaining({ event: "automation.rule.fired", ruleId: RULE, trigger: "recordCreated" }),
      }),
    );
    webhooks.send.mockResolvedValueOnce({ sent: false, reason: "plan" });
    expect((await runner.run([effect], context())).outcomes[0]).toMatchObject({ status: "skipped", detail: "webhook:plan" });
    webhooks.send.mockResolvedValueOnce({ sent: false, statusCode: 500 });
    expect((await runner.run([effect], context())).outcomes[0]).toMatchObject({ status: "failed", detail: "webhookStatus:500" });
  });

  it("stops at the first failed effect and skips the rest", async () => {
    const { records, runner } = ports();
    records.mutate.mockResolvedValueOnce({ ok: false, message: "A required field is missing" });
    const effects = [
      { kind: "setField" as const, fields: [{ fieldId: STAGE, value: null }] },
      { ...notify, recipients: { ruleOwner: true, assignees: false, userIds: [] }, notificationKind: "ruleAlert" as const },
    ];
    const { outcomes, failure } = await runner.run(effects, context());
    expect(failure).toBe("A required field is missing");
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["failed", "skipped"]);
  });

  it("turns an unexpected error into a failed effect instead of throwing", async () => {
    const { records, runner } = ports();
    records.read.mockRejectedValueOnce(new Error("boom"));
    const { outcomes, failure } = await runner.run([{ kind: "setField", fields: [{ fieldId: STAGE, value: null }] }], context());
    expect(outcomes[0]).toEqual({ kind: "setField", status: "failed", detail: "unexpectedError" });
    expect(failure).toBe("unexpectedError");
  });
});

function seedRun(repo: FakeAutomationRuleRepo, ruleOverrides: Record<string, unknown> = {}) {
  repo.addRule({
    id: RULE,
    triggerKind: "recordCreated",
    typeId: TYPE,
    trigger: { kind: "recordCreated", typeId: TYPE },
    effects: [{ ...notify, recipients: { ruleOwner: true, assignees: false, userIds: [] }, notificationKind: "ruleAlert" }],
    ...ruleOverrides,
  });
  return repo.admitRunUnscoped({
    companyId: COMPANY,
    ruleId: RULE,
    occurrenceKey: "event:e1",
    triggerKind: "recordCreated",
    typeId: TYPE,
    recordId: RECORD,
    payload: { chain: [] },
    depth: 0,
    scheduledFor: NOW,
  });
}

describe("running a rule", () => {
  let repo: FakeAutomationRuleRepo;
  beforeEach(() => {
    repo = new FakeAutomationRuleRepo();
  });

  function interactor(record: AutomationRecordView | null = view()) {
    const set = ports(record);
    return { ...set, interactor: new RunAutomationRuleInteractor(repo, set.runner, set.records as never, () => NOW) };
  }

  const run = (instance: RunAutomationRuleInteractor, runId: string, user = mockUser) =>
    runWithTenant(user, () => instance.invoke({ runId }));

  it("claims the run, applies the effects and settles it as applied", async () => {
    const runId = (await seedRun(repo)) as string;
    const { interactor: instance, notifications } = interactor();
    await expect(run(instance, runId)).resolves.toEqual({ ok: true, data: { status: "applied" } });
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(repo.runs.get(runId)).toMatchObject({ status: "applied", error: null });
    expect(repo.rules.get(RULE)).toMatchObject({ lastRunStatus: "applied" });
  });

  it("does nothing the second time the same run is handed over", async () => {
    const runId = (await seedRun(repo)) as string;
    const { interactor: instance, notifications } = interactor();
    await run(instance, runId);
    await expect(run(instance, runId)).resolves.toEqual({ ok: true, data: { status: "notClaimed" } });
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it("re-claims a run that stayed running for longer than ten minutes", async () => {
    const runId = (await seedRun(repo)) as string;
    const stuck = repo.runs.get(runId);
    if (stuck) repo.runs.set(runId, { ...stuck, status: "running", startedAt: new Date(NOW.getTime() - 11 * 60 * 1000) });
    const { interactor: instance } = interactor();
    await expect(run(instance, runId)).resolves.toEqual({ ok: true, data: { status: "applied" } });
  });

  it("skips when the conditions are not met", async () => {
    const runId = (await seedRun(repo, {
      conditions: [{ fieldId: STAGE, operator: "equals", value: { kind: "select", value: "lost" } }],
    })) as string;
    const { interactor: instance, notifications } = interactor();
    await expect(run(instance, runId)).resolves.toEqual({ ok: true, data: { status: "skipped" } });
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(repo.runs.get(runId)?.outcome).toMatchObject({ reason: "conditionsNotMet" });
  });

  it("runs when the conditions hold", async () => {
    const runId = (await seedRun(repo, {
      conditions: [{ fieldId: STAGE, operator: "equals", value: { kind: "select", value: "won" } }],
    })) as string;
    const { interactor: instance } = interactor();
    await expect(run(instance, runId)).resolves.toEqual({ ok: true, data: { status: "applied" } });
  });

  it("skips when the rule was disabled, the owner changed or the record is gone", async () => {
    const disabled = (await seedRun(repo, { enabled: false })) as string;
    expect(await run(interactor().interactor, disabled)).toEqual({ ok: true, data: { status: "skipped" } });
    expect(repo.runs.get(disabled)?.outcome).toMatchObject({ reason: "ruleDisabled" });

    const other = new FakeAutomationRuleRepo();
    const changedOwner = (await seedRun(other, { ownerUserId: OTHER_USER })) as string;
    const set = ports();
    const instance = new RunAutomationRuleInteractor(other, set.runner, set.records as never, () => NOW);
    expect(await run(instance, changedOwner)).toEqual({ ok: true, data: { status: "skipped" } });
    expect(other.runs.get(changedOwner)?.outcome).toMatchObject({ reason: "ownerChanged" });

    const gone = new FakeAutomationRuleRepo();
    const missing = (await seedRun(gone)) as string;
    const none = ports(null);
    const third = new RunAutomationRuleInteractor(gone, none.runner, none.records as never, () => NOW);
    expect(await run(third, missing)).toEqual({ ok: true, data: { status: "skipped" } });
    expect(gone.runs.get(missing)?.outcome).toMatchObject({ reason: "recordUnavailable" });
  });

  it("skips when the owner no longer has any access to automations", async () => {
    const runId = (await seedRun(repo)) as string;
    const limited = { ...createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readAll }]), id: OWNER, companyId: COMPANY };
    const { interactor: instance } = interactor();
    expect(await run(instance, runId, limited)).toEqual({ ok: true, data: { status: "skipped" } });
    expect(repo.runs.get(runId)?.outcome).toMatchObject({ reason: "ownerNotPermitted" });
  });

  it("settles as failed with the reason when an effect fails", async () => {
    const runId = (await seedRun(repo)) as string;
    const { interactor: instance, notifications } = interactor();
    notifications.notify.mockRejectedValueOnce(new Error("mail down"));
    await expect(run(instance, runId)).resolves.toEqual({ ok: true, data: { status: "failed" } });
    expect(repo.runs.get(runId)).toMatchObject({ status: "failed", error: "unexpectedError" });
  });

  it("marks the changes of its effects with the rule so they cannot start it again", async () => {
    const runId = (await seedRun(repo, {
      effects: [{ kind: "setField", fields: [{ fieldId: STAGE, value: null }] }],
    })) as string;
    const seen: Array<string[] | undefined> = [];
    const set = ports();
    set.records.mutate.mockImplementation(() => {
      seen.push(currentAutomationChain());
      return Promise.resolve({ ok: true, refs: [] });
    });
    const instance = new RunAutomationRuleInteractor(repo, set.runner, set.records as never, () => NOW);
    await run(instance, runId);
    expect(seen).toEqual([[RULE]]);
    expect(currentAutomationChain()).toBeUndefined();
  });

  it("extends the chain it was started with", async () => {
    const runId = (await seedRun(repo, {
      effects: [{ kind: "setField", fields: [{ fieldId: STAGE, value: null }] }],
    })) as string;
    const started = repo.runs.get(runId);
    if (started) repo.runs.set(runId, { ...started, payload: { chain: [RULE_B] } });
    const seen: Array<string[] | undefined> = [];
    const set = ports();
    set.records.mutate.mockImplementation(() => {
      seen.push(currentAutomationChain());
      return Promise.resolve({ ok: true, refs: [] });
    });
    await run(new RunAutomationRuleInteractor(repo, set.runner, set.records as never, () => NOW), runId);
    expect(seen).toEqual([[RULE_B, RULE]]);
  });

  it("discards a run whose owner is gone and disables the rule", async () => {
    const runId = (await seedRun(repo)) as string;
    const discard = new DiscardAutomationRuleRunInteractor(repo, () => NOW);
    await expect(discard.invoke({ runId, companyId: COMPANY, reason: "ownerInactive" })).resolves.toEqual({ discarded: true });
    expect(repo.runs.get(runId)).toMatchObject({ status: "skipped" });
    expect(repo.rules.get(RULE)).toMatchObject({ enabled: false, disabledReason: "ownerInactive" });
    await expect(discard.invoke({ runId, companyId: COMPANY, reason: "ownerInactive" })).resolves.toEqual({ discarded: false });
  });
});

const UUID = (suffix: string) => `77777777-7777-4777-8777-${suffix.padStart(12, "0")}`;

function recordEvent(input: {
  id?: string;
  kind?: "record.created" | "record.updated";
  changed?: string[];
  after?: CalculatedValue;
  ruleChain?: string[];
}) {
  const fieldId = input.changed?.[0];
  return {
    id: input.id ?? UUID("1"),
    companyId: COMPANY,
    kind: input.kind ?? "record.created",
    subjectKind: "record",
    subjectTypeId: TYPE,
    subjectId: RECORD,
    payload: {
      ref: { typeId: TYPE, recordId: RECORD },
      schemaRevision: 1,
      cause: { kind: "mutation", ...(input.ruleChain ? { ruleChain: input.ruleChain } : {}) },
      beforeVersion: null,
      afterVersion: 1,
      changedFieldIds: input.changed ?? [],
      fields: fieldId
        ? [
            {
              fieldId,
              before: null,
              after: {
                fieldId,
                label: "Stage",
                valueType: "select",
                options: [],
                value: input.after ?? { state: "missing" },
                sources: [],
                publications: [],
                publishedSummary: false,
                dependencyHash: "h",
              },
            },
          ]
        : [],
      assignments: null,
      identities: null,
      links: [],
    },
  };
}

describe("admitting events", () => {
  let repo: FakeAutomationRuleRepo;
  let dispatch: ReturnType<typeof vi.fn>;
  let admission: AutomationRuleAdmission;
  beforeEach(() => {
    repo = new FakeAutomationRuleRepo();
    dispatch = vi.fn().mockResolvedValue(undefined);
    admission = new AutomationRuleAdmission(repo, { dispatch }, () => NOW);
  });

  const admit = (event: ReturnType<typeof recordEvent> | Record<string, unknown>) => admission.admit(event as never);

  it("queues one run for a created record and hands it to the background worker", async () => {
    seedRule(repo);
    await admit(recordEvent({}));
    expect([...repo.runs.values()]).toHaveLength(1);
    expect(dispatch).toHaveBeenCalledWith("run-automation-rule", {
      runId: expect.any(String),
      companyId: COMPANY,
      ownerUserId: OWNER,
    });
    expect([...repo.runs.values()][0]).toMatchObject({ occurrenceKey: `event:${UUID("1")}`, recordId: RECORD, typeId: TYPE });
  });

  it("is idempotent when the same event is delivered twice", async () => {
    seedRule(repo);
    await admit(recordEvent({}));
    await admit(recordEvent({}));
    expect(repo.runs.size).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    await admit(recordEvent({ id: UUID("2") }));
    expect(repo.runs.size).toBe(2);
  });

  it("ignores disabled rules, other lists and rules without an owner", async () => {
    seedRule(repo, { id: RULE, enabled: false });
    seedRule(repo, { id: RULE_B, typeId: TASKS, trigger: { kind: "recordCreated", typeId: TASKS } });
    seedRule(repo, { id: UUID("a3"), ownerUserId: null });
    await admit(recordEvent({}));
    expect(repo.runs.size).toBe(0);
  });

  it("starts an update rule only when a watched field changed", async () => {
    seedRule(repo, {
      triggerKind: "recordUpdated",
      trigger: { kind: "recordUpdated", typeId: TYPE, fieldIds: [STAGE] },
    });
    await admit(recordEvent({ kind: "record.updated", changed: [NEXT_STEP], id: UUID("3") }));
    expect(repo.runs.size).toBe(0);
    await admit(recordEvent({ kind: "record.updated", changed: [STAGE], id: UUID("4") }));
    expect(repo.runs.size).toBe(1);
  });

  it("starts a field-changed rule only for the chosen value", async () => {
    seedRule(repo, {
      triggerKind: "fieldChanged",
      trigger: { kind: "fieldChanged", typeId: TYPE, fieldId: STAGE, to: { kind: "select", value: "won" } },
    });
    const to = (value: string): CalculatedValue => ({ state: "value", value: { kind: "select", value } });
    await admit(recordEvent({ kind: "record.updated", changed: [STAGE], after: to("lost"), id: UUID("5") }));
    expect(repo.runs.size).toBe(0);
    await admit(recordEvent({ kind: "record.updated", changed: [STAGE], after: to("won"), id: UUID("6") }));
    expect(repo.runs.size).toBe(1);
  });

  it("never lets a rule's own change start the same rule again", async () => {
    seedRule(repo);
    await admit(recordEvent({ ruleChain: [RULE] }));
    expect(repo.runs.size).toBe(0);
  });

  it("lets one rule's change start a different rule, but not a third", async () => {
    seedRule(repo);
    await admit(recordEvent({ ruleChain: [RULE_B], id: UUID("7") }));
    expect(repo.runs.size).toBe(1);
    expect([...repo.runs.values()][0]?.payload).toMatchObject({ chain: [RULE_B] });
    await admit(recordEvent({ ruleChain: [RULE_B, UUID("a4")], id: UUID("8") }));
    expect(repo.runs.size).toBe(1);
  });

  it("ignores record events that are not creations or updates", async () => {
    seedRule(repo);
    await admit({ ...recordEvent({}), kind: "record.deleted" });
    await admit({ ...recordEvent({}), payload: { broken: true } });
    expect(repo.runs.size).toBe(0);
  });

  it("starts message rules only for accounts the owner can access, filtered by channel", async () => {
    seedRule(repo, {
      triggerKind: "messageReceived",
      typeId: null,
      trigger: { kind: "messageReceived", channel: "email" },
    });
    const message = (kind: string, id: string) => ({
      id,
      companyId: COMPANY,
      kind,
      subjectKind: "messaging",
      payload: { connectedAccountId: "acct-1", threadId: "t1" },
    });
    await admit(message("messaging.email.received", UUID("9")));
    expect(repo.runs.size).toBe(0);
    repo.accessibleAccounts.add("acct-1");
    await admit(message("messaging.message.received", UUID("10")));
    expect(repo.runs.size).toBe(0);
    await admit(message("messaging.email.received", UUID("11")));
    expect(repo.runs.size).toBe(1);
    expect([...repo.runs.values()][0]).toMatchObject({ recordId: null, typeId: null });
  });

  it("starts form and webhook rules for the chosen source and ignores duplicates", async () => {
    const FORM = "88888888-8888-4888-8888-888888888888";
    seedRule(repo, {
      triggerKind: "formSubmitted",
      typeId: TYPE,
      trigger: { kind: "formSubmitted", typeId: TYPE, sourceId: FORM },
    });
    const submitted = (id: string, extra: Record<string, unknown>) => ({
      id,
      companyId: COMPANY,
      kind: "form.submitted",
      subjectKind: "form",
      payload: { typeId: TYPE, recordId: RECORD, formId: FORM, outcome: "created", ...extra },
    });
    await admit(submitted(UUID("12"), { formId: "99999999-9999-4999-8999-999999999999" }));
    await admit(submitted(UUID("13"), { outcome: "duplicate" }));
    await admit(submitted(UUID("14"), { recordId: null }));
    expect(repo.runs.size).toBe(0);
    await admit(submitted(UUID("15"), {}));
    expect(repo.runs.size).toBe(1);
    expect([...repo.runs.values()][0]).toMatchObject({ recordId: RECORD, triggerKind: "formSubmitted" });
  });
});

function seedRule(repo: FakeAutomationRuleRepo, overrides: Record<string, unknown> = {}) {
  return repo.addRule({
    id: RULE,
    triggerKind: "recordCreated",
    typeId: TYPE,
    trigger: { kind: "recordCreated", typeId: TYPE },
    effects: [notify],
    ...overrides,
  } as never);
}

describe("sweeping date-reached rules", () => {
  let repo: FakeAutomationRuleRepo;
  let dispatch: ReturnType<typeof vi.fn>;
  let sweep: SweepAutomationRulesInteractor;
  const trigger = {
    kind: "dateReached",
    typeId: TYPE,
    fieldId: NEXT_STEP,
    days: 1,
    direction: "before",
    atHour: 8,
    timezone: "Europe/Berlin",
  };

  beforeEach(() => {
    repo = new FakeAutomationRuleRepo();
    dispatch = vi.fn().mockResolvedValue(undefined);
    const discard = new DiscardAutomationRuleRunInteractor(repo, () => NOW);
    sweep = new SweepAutomationRulesInteractor(repo, { dispatch }, discard);
    seedRule(repo, { triggerKind: "dateReached", trigger });
  });

  it("fires once the offset date and hour are reached, and only once", async () => {
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-13" }];
    await expect(sweep.invoke(new Date("2026-11-12T06:59:00.000Z"))).resolves.toMatchObject({ automationRulesAdmitted: 0 });
    await expect(sweep.invoke(new Date("2026-11-12T07:00:00.000Z"))).resolves.toMatchObject({ automationRulesAdmitted: 1 });
    await expect(sweep.invoke(new Date("2026-11-12T07:05:00.000Z"))).resolves.toMatchObject({ automationRulesAdmitted: 0 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect([...repo.runs.values()][0]).toMatchObject({ recordId: RECORD, occurrenceKey: `date:${RECORD}:${NEXT_STEP}:2026-11-13:before1` });
  });

  it("reads the hour in the rule's time zone", async () => {
    seedRule(repo, { id: RULE_B, triggerKind: "dateReached", trigger: { ...trigger, timezone: "America/Los_Angeles" } });
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-13" }];
    await sweep.invoke(new Date("2026-11-12T07:30:00.000Z"));
    expect([...repo.runs.values()].map((run) => run.ruleId)).toEqual([RULE]);
    await sweep.invoke(new Date("2026-11-12T16:30:00.000Z"));
    expect([...repo.runs.values()].map((run) => run.ruleId).sort()).toEqual([RULE, RULE_B].sort());
  });

  it("does not fire for dates that were reached more than a week ago", async () => {
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-03" }];
    await sweep.invoke(NOW);
    expect(repo.runs.size).toBe(0);
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-09" }];
    await sweep.invoke(NOW);
    expect(repo.runs.size).toBe(1);
  });

  it("fires again for a record whose date was moved", async () => {
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-13" }];
    await sweep.invoke(NOW);
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-12" }];
    await sweep.invoke(NOW);
    expect(repo.runs.size).toBe(2);
  });

  it("handles date and time values and rules that fire after the date", async () => {
    repo.rules.clear();
    seedRule(repo, {
      triggerKind: "dateReached",
      trigger: { ...trigger, days: 2, direction: "after", timezone: "UTC" },
    });
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-10T07:00:00.000Z" }];
    await expect(sweep.invoke(new Date("2026-11-12T06:59:00.000Z"))).resolves.toMatchObject({ automationRulesAdmitted: 0 });
    await expect(sweep.invoke(new Date("2026-11-12T07:00:00.000Z"))).resolves.toMatchObject({ automationRulesAdmitted: 1 });
  });

  it("skips rules without an owner and disabled rules", async () => {
    repo.rules.clear();
    seedRule(repo, { triggerKind: "dateReached", trigger, ownerUserId: null });
    seedRule(repo, { id: RULE_B, triggerKind: "dateReached", trigger, enabled: false });
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-13" }];
    await sweep.invoke(new Date("2026-11-12T07:30:00.000Z"));
    expect(repo.runs.size).toBe(0);
  });

  it("hands stalled runs to the worker again and discards those without an owner", async () => {
    const queued = (await seedRun(repo, { id: UUID("b1") })) as string;
    const orphan = new FakeAutomationRuleRepo();
    const orphanRun = (await seedRun(orphan, { ownerUserId: null })) as string;
    const old = new Date("2026-11-12T07:00:00.000Z");
    for (const [store, id] of [[repo, queued], [orphan, orphanRun]] as const) {
      const run = store.runs.get(id);
      if (run) store.runs.set(id, { ...run, createdAt: old });
    }
    dispatch.mockClear();
    await expect(sweep.invoke(NOW)).resolves.toMatchObject({ automationRunsRedispatched: 1 });
    expect(dispatch).toHaveBeenCalledWith("run-automation-rule", { runId: queued, companyId: COMPANY, ownerUserId: OWNER });
    const discardSweep = new SweepAutomationRulesInteractor(orphan, { dispatch }, new DiscardAutomationRuleRunInteractor(orphan, () => NOW));
    await discardSweep.invoke(NOW);
    expect(orphan.runs.get(orphanRun)?.status).toBe("skipped");
  });
});
