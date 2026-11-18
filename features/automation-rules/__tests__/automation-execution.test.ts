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
import type { AutomationRecipientAccess, AutomationRecordView } from "../automation-ports";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { AutomationEffectRunner } from "../automation-effect-runner";
import { currentDateValue, normalisedDateValue } from "../automation-occurrence";
import { AutomationRuleAdmission } from "../automation-rule-admission";
import { currentCausation } from "@/core/decorators/causation-context";
import { RoutineAdmission } from "@/ee/routines/routine-admission";
import { recordCauseBy } from "@/features/records/record-event-cause";
import { DiscardAutomationRuleRunInteractor } from "../discard-automation-rule-run.interactor";
import { PruneAutomationRuleRunsInteractor } from "../prune-automation-rule-runs.interactor";
import { RunAutomationRuleInteractor } from "../run-automation-rule.interactor";
import { SweepAutomationRulesInteractor } from "../sweep-automation-rules.interactor";
import { FakeAutomationRuleRepo } from "./fake-automation-rule-repo";
import { FakeDateCandidateReader } from "./fake-date-candidate-reader";

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

const CLOSES = "22222222-2222-4222-8222-666666666666";

const notify = { kind: "notify", recipients: { ruleOwner: true }, title: "Look at {{record.name}}" };

function modelField(id: string, typeId: string, valueType: string, archived = false) {
  const options = valueType === "select" ? ["won", "lost"].map((option) => ({ id: option, label: option })) : [];
  return { id, typeId, valueType, multiple: false, behavior: { kind: "input" }, archived, options };
}

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
      types: [
        { id: TYPE, archived: false },
        { id: TASKS, archived: false },
      ],
      fields: [
        modelField(STAGE, TYPE, "select"),
        modelField(CLOSES, TYPE, "date"),
        modelField(DUE, TASKS, "date"),
        modelField(NEXT_STEP, TASKS, "dateTime"),
      ],
      relationships: [],
    }),
    read: vi.fn().mockResolvedValue(record),
    mutate: vi.fn().mockResolvedValue({ ok: true, refs: [{ typeId: TASKS, recordId: "created" }] }),
  };
  const notifications = { notify: vi.fn().mockResolvedValue({ created: 2 }) };
  const events = { publish: vi.fn().mockResolvedValue(undefined) };
  const webhooks = {
    findOutboundWebhookUnscoped: vi
      .fn()
      .mockResolvedValue({ id: WEBHOOK, enabled: true, events: ["automation.rule.fired"] }),
  };
  const recipientAccess = {
    recordAccess: vi.fn((input: { userIds: readonly string[] }) =>
      Promise.resolve(new Map<string, AutomationRecipientAccess>(input.userIds.map((userId) => [userId, "name"]))),
    ),
  };
  return {
    records,
    notifications,
    events,
    webhooks,
    recipientAccess,
    runner: new AutomationEffectRunner(records as never, notifications, events, webhooks, null, recipientAccess),
  };
}

function context(trigger: Record<string, unknown> = { kind: "recordCreated", typeId: TYPE }) {
  return {
    companyId: COMPANY,
    runId: "run-00000001",
    rule: { id: RULE, name: "Follow up", ownerUserId: OWNER, trigger: trigger as never },
    recordRef: { typeId: TYPE, recordId: RECORD },
    now: NOW,
    admittedAt: NOW,
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

  it("sets fields again at the new version when a sibling rule changed the record in between", async () => {
    const { records, runner } = ports();
    records.read.mockResolvedValueOnce(view({ version: 3 })).mockResolvedValueOnce(view({ version: 4 }));
    records.mutate
      .mockResolvedValueOnce({ ok: false, message: "This record changed.", versionChanged: true })
      .mockResolvedValueOnce({ ok: true, refs: [] });
    const fields = [{ fieldId: STAGE, value: { kind: "select" as const, value: "lost" } }];
    const { outcomes, failure } = await runner.run([{ kind: "setField", fields }], context());
    expect(failure).toBeNull();
    expect(outcomes).toEqual([{ kind: "setField", status: "applied", recordRef: { typeId: TYPE, recordId: RECORD } }]);
    expect(records.mutate.mock.calls.map(([call]) => call.mutation.expectedVersion)).toEqual([3, 4]);
  });

  it("gives up on a record that keeps changing and never retries another failure", async () => {
    const fields = [{ fieldId: STAGE, value: { kind: "select" as const, value: "lost" } }];
    const busy = ports();
    busy.records.mutate.mockResolvedValue({ ok: false, message: "This record changed.", versionChanged: true });
    const exhausted = await busy.runner.run([{ kind: "setField", fields }], context());
    expect(exhausted.outcomes).toEqual([{ kind: "setField", status: "failed", detail: "This record changed." }]);
    expect(busy.records.mutate).toHaveBeenCalledTimes(3);
    const refused = ports();
    refused.records.mutate.mockResolvedValue({ ok: false, message: "Not allowed." });
    const other = await refused.runner.run([{ kind: "setField", fields }], context());
    expect(other.outcomes).toEqual([{ kind: "setField", status: "failed", detail: "Not allowed." }]);
    expect(refused.records.mutate).toHaveBeenCalledTimes(1);
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
    const trigger = {
      kind: "dateReached",
      typeId: TYPE,
      fieldId: STAGE,
      days: 1,
      direction: "before",
      atHour: 8,
      timezone: "Asia/Tokyo",
    };
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

  it("counts the due date of a record rule from today in the rule's time zone", async () => {
    const effect = {
      kind: "createRecord" as const,
      typeId: TASKS,
      due: { fieldId: DUE, offsetDays: 0 },
      fields: [],
      assignToRuleOwner: false,
      assignedUserIds: [],
    };
    const justAfterMidnightInBerlin = new Date("2026-11-12T23:30:00.000Z");
    const dueDay = async (trigger: Record<string, unknown>) => {
      const { records, runner } = ports();
      await runner.run([effect], { ...context(trigger), admittedAt: justAfterMidnightInBerlin });
      const call = records.mutate.mock.calls[0]?.[0] as { mutation: { fields: unknown[] } };
      return call.mutation.fields;
    };
    expect(await dueDay({ kind: "recordCreated", typeId: TYPE, timezone: "Europe/Berlin" })).toEqual([
      { fieldId: DUE, value: { kind: "date", value: "2026-11-13" } },
    ]);
    expect(await dueDay({ kind: "formSubmitted", typeId: TYPE, timezone: "America/New_York" })).toEqual([
      { fieldId: DUE, value: { kind: "date", value: "2026-11-12" } },
    ]);
    expect(await dueDay({ kind: "recordCreated", typeId: TYPE })).toEqual([
      { fieldId: DUE, value: { kind: "date", value: "2026-11-12" } },
    ]);
  });

  it("gives a date and time due field a moment two days from now", async () => {
    const { records, runner } = ports();
    await runner.run(
      [
        {
          kind: "createRecord",
          typeId: TASKS,
          due: { fieldId: NEXT_STEP, offsetDays: 2 },
          fields: [],
          assignToRuleOwner: false,
          assignedUserIds: [],
        },
      ],
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

  it("leaves the record name and the link out for a member who cannot read the record", async () => {
    const READER = "00000000-0000-4000-8000-000000000013";
    const NAMELESS = "00000000-0000-4000-8000-000000000014";
    const { notifications, recipientAccess, runner } = ports();
    recipientAccess.recordAccess.mockResolvedValue(
      new Map<string, AutomationRecipientAccess>([
        [READER, "name"],
        [NAMELESS, "record"],
        [OTHER_USER, "none"],
      ]),
    );
    notifications.notify.mockResolvedValue({ created: 1 });
    const effect = {
      kind: "notify" as const,
      recipients: { ruleOwner: true, assignees: true, userIds: [READER, NAMELESS] },
      notificationKind: "ruleAlert" as const,
      title: "{{record.name}}",
      body: "Deal {{record.name}} moved ({{rule.name}})",
    };
    const { outcomes } = await runner.run([effect], context());

    expect(outcomes).toEqual([{ kind: "notify", status: "applied", detail: "3" }]);
    expect(recipientAccess.recordAccess).toHaveBeenCalledExactlyOnceWith({
      companyId: COMPANY,
      ref: { typeId: TYPE, recordId: RECORD },
      userIds: [READER, NAMELESS, OTHER_USER],
    });
    const shared = { companyId: COMPANY, kind: "ruleAlert", sourceRuleId: RULE, dedupeKey: "rule:run-00000001:0" };
    expect(notifications.notify.mock.calls.map(([call]) => call)).toEqual([
      {
        ...shared,
        recipients: [READER, OWNER],
        title: "Acme",
        body: "Deal Acme moved (Follow up)",
        href: `/records/${TYPE}/${RECORD}`,
      },
      {
        ...shared,
        recipients: [NAMELESS],
        title: "Follow up",
        body: "Deal  moved (Follow up)",
        href: `/records/${TYPE}/${RECORD}`,
      },
      { ...shared, recipients: [OTHER_USER], title: "Follow up", body: "Deal  moved (Follow up)", href: null },
    ]);
  });

  it("checks the link of a notification that does not name the record, and never the owner", async () => {
    const { notifications, recipientAccess, records, runner } = ports();
    recipientAccess.recordAccess.mockResolvedValue(new Map<string, AutomationRecipientAccess>([[OTHER_USER, "none"]]));
    const effect = {
      kind: "notify" as const,
      recipients: { ruleOwner: true, assignees: false, userIds: [OTHER_USER] },
      notificationKind: "ruleAlert" as const,
      title: "A deal moved",
    };
    await runner.run([effect], context());
    expect(records.read).not.toHaveBeenCalled();
    expect(notifications.notify.mock.calls.map(([call]) => [call.recipients, call.href])).toEqual([
      [[OTHER_USER], null],
      [[OWNER], `/records/${TYPE}/${RECORD}`],
    ]);

    notifications.notify.mockClear();
    recipientAccess.recordAccess.mockClear();
    await runner.run([{ ...effect, recipients: { ruleOwner: true, assignees: false, userIds: [] } }], context());
    expect(recipientAccess.recordAccess).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it("tells nobody but the owner about the record when no access check is wired", async () => {
    const set = ports();
    const bare = new AutomationEffectRunner(set.records as never, set.notifications, set.events, set.webhooks);
    const effect = {
      kind: "notify" as const,
      recipients: { ruleOwner: true, assignees: true, userIds: [] },
      notificationKind: "ruleAlert" as const,
      title: "Due: {{record.name}}",
    };
    await bare.run([effect], context());
    expect(set.notifications.notify.mock.calls.map(([call]) => [call.recipients, call.title, call.href])).toEqual([
      [[OWNER], "Due: Acme", `/records/${TYPE}/${RECORD}`],
      [[OTHER_USER], "Due:", null],
    ]);
  });

  it("skips a notification that has nobody to tell", async () => {
    const { notifications, runner } = ports(view({ assignedUserIds: [] }));
    const effect = { kind: "notify" as const, recipients: { assignees: true }, title: "x" };
    const { outcomes } = await runner.run(
      [{ ...effect, recipients: { ruleOwner: false, assignees: true, userIds: [] }, notificationKind: "ruleAlert" }],
      context(),
    );
    expect(outcomes).toEqual([{ kind: "notify", status: "skipped", detail: "noRecipients" }]);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it("publishes the rule event for the chosen webhook and skips a webhook that cannot receive it", async () => {
    const { events, webhooks, runner } = ports();
    const effect = { kind: "callWebhook" as const, webhookId: WEBHOOK };
    expect((await runner.run([effect], context())).outcomes[0]).toEqual({ kind: "callWebhook", status: "applied" });
    expect(webhooks.findOutboundWebhookUnscoped).toHaveBeenCalledWith(COMPANY, WEBHOOK);
    expect(events.publish).toHaveBeenCalledWith("automation.rule.fired", {
      entityId: RULE,
      payload: {
        webhookId: WEBHOOK,
        ruleId: RULE,
        ruleName: "Follow up",
        runId: "run-00000001",
        trigger: "recordCreated",
        firedAt: NOW.toISOString(),
        record: { typeId: TYPE, recordId: RECORD },
      },
    });
    events.publish.mockClear();
    for (const [stored, detail] of [
      [null, "webhook:missing"],
      [{ id: WEBHOOK, enabled: false, events: ["automation.rule.fired"] }, "webhook:disabled"],
      [{ id: WEBHOOK, enabled: true, events: ["record.created"] }, "webhook:notSubscribed"],
    ] as const) {
      webhooks.findOutboundWebhookUnscoped.mockResolvedValueOnce(stored);
      expect((await runner.run([effect], context())).outcomes[0]).toMatchObject({ status: "skipped", detail });
    }
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("stops at the first failed effect and skips the rest", async () => {
    const { records, runner } = ports();
    records.mutate.mockResolvedValueOnce({ ok: false, message: "A required field is missing" });
    const effects = [
      { kind: "setField" as const, fields: [{ fieldId: STAGE, value: null }] },
      {
        ...notify,
        recipients: { ruleOwner: true, assignees: false, userIds: [] },
        notificationKind: "ruleAlert" as const,
      },
    ];
    const { outcomes, failure } = await runner.run(effects as never, context());
    expect(failure).toBe("A required field is missing");
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["failed", "skipped"]);
  });

  it("turns an unexpected error into a failed effect instead of throwing", async () => {
    const { records, runner } = ports();
    records.read.mockRejectedValueOnce(new Error("boom"));
    const { outcomes, failure } = await runner.run(
      [{ kind: "setField", fields: [{ fieldId: STAGE, value: null }] }],
      context(),
    );
    expect(outcomes[0]).toEqual({ kind: "setField", status: "failed", detail: "unexpectedError" });
    expect(failure).toBe("unexpectedError");
  });

  const setStage = { kind: "setField" as const, fields: [{ fieldId: STAGE, value: null }] };
  const tellOwner = {
    ...notify,
    recipients: { ruleOwner: true, assignees: false, userIds: [] },
    notificationKind: "ruleAlert" as const,
  };

  it("continues after the effects an earlier attempt of the same run settled", async () => {
    const { records, notifications, runner } = ports();
    const save = vi.fn().mockResolvedValue(undefined);
    const done = [{ kind: "setField" as const, status: "applied" as const }];
    const { outcomes, failure } = await runner.run([setStage, tellOwner] as never, context(), { done, save });
    expect(failure).toBeNull();
    expect(records.mutate).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(outcomes.map((outcome) => [outcome.kind, outcome.status])).toEqual([
      ["setField", "applied"],
      ["notify", "applied"],
    ]);
    expect(save).toHaveBeenLastCalledWith(outcomes);
  });

  it("tries a failed effect of an earlier attempt again, and one that is no longer the same step", async () => {
    const { records, notifications, runner } = ports();
    const save = vi.fn().mockResolvedValue(undefined);
    const failed = [
      { kind: "setField" as const, status: "failed" as const, detail: "unexpectedError" },
      { kind: "notify" as const, status: "skipped" as const, detail: "previousEffectFailed" },
    ];
    await runner.run([setStage, tellOwner] as never, context(), { done: failed, save });
    expect(records.mutate).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    const moved = [{ kind: "notify" as const, status: "applied" as const }];
    await runner.run([setStage, tellOwner] as never, context(), { done: moved, save });
    expect(records.mutate).toHaveBeenCalledTimes(2);
  });

  it("counts a write that is refused for its own receipt as applied and goes on", async () => {
    const { records, notifications, runner } = ports();
    records.mutate.mockResolvedValue({ ok: false, message: "Idempotency key reused", alreadyApplied: true });
    const create = { kind: "createRecord" as const, typeId: TASKS, fields: [], assignedUserIds: [] };
    const { outcomes, failure } = await runner.run([setStage, create, tellOwner] as never, context());
    expect(failure).toBeNull();
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["applied", "applied", "applied"]);
    expect(records.mutate).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it("publishes the rule event at most once per run and effect", async () => {
    const { events, runner } = ports();
    const calls: string[] = [];
    const stored: Array<{ kind: string; status: string }[]> = [];
    const save = vi.fn((outcomes: Array<{ kind: string; status: string }>) => {
      calls.push("save");
      stored.push(outcomes);
      return Promise.resolve();
    });
    events.publish.mockImplementation(() => {
      calls.push("publish");
      return Promise.resolve();
    });
    const effect = { kind: "callWebhook" as const, webhookId: WEBHOOK };
    await runner.run([effect], context(), { done: [], save });
    expect(calls).toEqual(["save", "publish", "save"]);
    expect(stored[0]).toEqual([{ kind: "callWebhook", status: "applied" }]);
    await runner.run([effect], context(), { done: stored[0] as never, save });
    expect(events.publish).toHaveBeenCalledTimes(1);
  });

  it("counts a due date from the time the run was admitted, not from the attempt", async () => {
    const { records, runner } = ports();
    const effect = {
      kind: "createRecord" as const,
      typeId: TASKS,
      fields: [],
      assignedUserIds: [],
      due: { fieldId: NEXT_STEP, offsetDays: 2 },
    };
    const admittedAt = new Date("2026-11-12T07:40:00.000Z");
    for (const now of [NOW, new Date(NOW.getTime() + 11 * 60 * 1000)])
      await runner.run([effect] as never, { ...context(), now, admittedAt });
    const dues = records.mutate.mock.calls.map(([input]) => input.mutation.fields.at(-1));
    expect(dues).toEqual([
      { fieldId: NEXT_STEP, value: { kind: "dateTime", value: "2026-11-14T07:40:00.000Z" } },
      { fieldId: NEXT_STEP, value: { kind: "dateTime", value: "2026-11-14T07:40:00.000Z" } },
    ]);
  });
});

function seedRun(repo: FakeAutomationRuleRepo, ruleOverrides: Record<string, unknown> = {}) {
  repo.addRule({
    id: RULE,
    triggerKind: "recordCreated",
    typeId: TYPE,
    trigger: { kind: "recordCreated", typeId: TYPE },
    effects: [
      { ...notify, recipients: { ruleOwner: true, assignees: false, userIds: [] }, notificationKind: "ruleAlert" },
    ],
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
    if (stuck)
      repo.runs.set(runId, { ...stuck, status: "running", startedAt: new Date(NOW.getTime() - 11 * 60 * 1000) });
    const { interactor: instance } = interactor();
    await expect(run(instance, runId)).resolves.toEqual({ ok: true, data: { status: "applied" } });
  });

  it("skips a run whose rule was changed after the event matched it, and says so", async () => {
    await seedRun(repo);
    const seed = async (occurrenceKey: string, subscriptionRevision: number) => {
      const runId = await repo.admitRunUnscoped({
        companyId: COMPANY,
        ruleId: RULE,
        occurrenceKey,
        triggerKind: "recordCreated",
        typeId: TYPE,
        recordId: RECORD,
        payload: { chain: [], subscriptionRevision },
        depth: 0,
        scheduledFor: NOW,
      });
      if (!runId) throw new Error("expected an admitted run");
      return runId;
    };
    repo.subscriptionRevisions.set(RULE, 3);
    const outdated = await seed("event:old", 2);
    const current = await seed("event:current", 3);
    const { interactor: instance, notifications } = interactor();
    await expect(run(instance, outdated)).resolves.toEqual({ ok: true, data: { status: "skipped" } });
    expect(repo.runs.get(outdated)?.outcome).toMatchObject({ reason: "ruleChanged", effects: [] });
    expect(notifications.notify).not.toHaveBeenCalled();
    await expect(run(instance, current)).resolves.toEqual({ ok: true, data: { status: "applied" } });
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it("finishes a reclaimed run whose own first effect made its conditions untrue", async () => {
    const runId = (await seedRun(repo, {
      conditions: [{ fieldId: STAGE, operator: "equals", value: { kind: "select", value: "won" } }],
      triggerKind: "dateReached",
      trigger: {
        kind: "dateReached",
        typeId: TYPE,
        fieldId: CLOSES,
        days: 1,
        direction: "before",
        atHour: 8,
        timezone: "UTC",
      },
      effects: [
        { kind: "setField", fields: [{ fieldId: STAGE, value: { kind: "select", value: "lost" } }] },
        { ...notify, recipients: { ruleOwner: true, assignees: false, userIds: [] }, notificationKind: "ruleAlert" },
      ],
    })) as string;
    const lost = view({
      values: new Map<string, CalculatedValue>([[STAGE, { state: "value", value: { kind: "select", value: "lost" } }]]),
    });
    const fresh = interactor(lost);
    await expect(run(fresh.interactor, runId)).resolves.toEqual({ ok: true, data: { status: "skipped" } });

    const stuck = repo.runs.get(runId);
    if (!stuck) throw new Error("expected the run");
    repo.runs.set(runId, {
      ...stuck,
      status: "running",
      startedAt: new Date(NOW.getTime() - 11 * 60 * 1000),
      outcome: { effects: [{ kind: "setField", status: "applied" }] },
    });
    const reclaimed = interactor(lost);
    await expect(run(reclaimed.interactor, runId)).resolves.toEqual({ ok: true, data: { status: "applied" } });
    expect(reclaimed.records.mutate).not.toHaveBeenCalled();
    expect(reclaimed.notifications.notify).toHaveBeenCalledTimes(1);
    expect(repo.runs.get(runId)?.outcome).toMatchObject({
      effects: [
        { kind: "setField", status: "applied" },
        { kind: "notify", status: "applied" },
      ],
    });
  });

  it("skips when the conditions are not met", async () => {
    const runId = (await seedRun(repo, {
      triggerKind: "formSubmitted",
      trigger: { kind: "formSubmitted", typeId: TYPE },
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

  it("reads today for a relative-day condition in the rule's time zone", async () => {
    const overdue = [{ fieldId: CLOSES, operator: "before", relativeDays: 0 }];
    const dueYesterdayInBerlin = view({
      values: new Map<string, CalculatedValue>([
        [CLOSES, { state: "value", value: { kind: "date", value: "2026-11-12" } }],
      ]),
    });
    const justAfterMidnightInBerlin = new Date("2026-11-12T23:30:00.000Z");
    const outcome = async (trigger: Record<string, unknown>) => {
      const store = new FakeAutomationRuleRepo();
      const runId = (await seedRun(store, { trigger, conditions: overdue })) as string;
      const set = ports(dueYesterdayInBerlin);
      const instance = new RunAutomationRuleInteractor(
        store,
        set.runner,
        set.records as never,
        () => justAfterMidnightInBerlin,
      );
      await run(instance, runId);
      return store.runs.get(runId)?.status;
    };
    expect(await outcome({ kind: "recordCreated", typeId: TYPE, timezone: "Europe/Berlin" })).toBe("applied");
    expect(await outcome({ kind: "recordCreated", typeId: TYPE })).toBe("skipped");
  });

  it("skips a date rule whose record no longer holds the date the sweep admitted", async () => {
    const dateTrigger = {
      kind: "dateReached",
      typeId: TYPE,
      fieldId: CLOSES,
      days: 1,
      direction: "before",
      atHour: 8,
      timezone: "Europe/Berlin",
    };
    const outcome = async (
      current: CalculatedValue | undefined,
      payload: { chain: string[]; fireAt?: string; fieldValue?: string },
    ) => {
      const store = new FakeAutomationRuleRepo();
      store.addRule({
        id: RULE,
        triggerKind: "dateReached",
        typeId: TYPE,
        trigger: dateTrigger,
        effects: [
          { ...notify, recipients: { ruleOwner: true, assignees: false, userIds: [] }, notificationKind: "ruleAlert" },
        ],
      });
      const runId = (await store.admitRunUnscoped({
        companyId: COMPANY,
        ruleId: RULE,
        occurrenceKey: `date:${RECORD}:${CLOSES}:2026-11-13:before1`,
        triggerKind: "dateReached",
        typeId: TYPE,
        recordId: RECORD,
        payload,
        depth: 0,
        scheduledFor: NOW,
      })) as string;
      const set = ports(view({ values: new Map<string, CalculatedValue>(current ? [[CLOSES, current]] : []) }));
      const instance = new RunAutomationRuleInteractor(store, set.runner, set.records as never, () => NOW);
      await run(instance, runId);
      const settled = store.runs.get(runId);
      return {
        status: settled?.status,
        reason: (settled?.outcome as { reason?: string } | null)?.reason,
        notified: set.notifications.notify.mock.calls.length,
      };
    };
    const admitted = { chain: [], fireAt: "2026-11-12T07:00:00.000Z", fieldValue: "2026-11-13" };
    const date = (value: string): CalculatedValue => ({ state: "value", value: { kind: "date", value } });

    expect(await outcome(date("2026-11-13"), admitted)).toMatchObject({ status: "applied", notified: 1 });
    expect(await outcome(date("2026-11-13T00:00:00.000Z"), admitted)).toMatchObject({ status: "applied" });
    expect(await outcome(date("2026-12-01"), admitted)).toEqual({
      status: "skipped",
      reason: "dateChanged",
      notified: 0,
    });
    expect(await outcome(undefined, admitted)).toEqual({ status: "skipped", reason: "dateChanged", notified: 0 });
    expect(await outcome({ state: "missing" }, admitted)).toMatchObject({ status: "skipped", reason: "dateChanged" });
    expect(await outcome(date("2026-12-01"), { chain: [] })).toMatchObject({ status: "applied" });
  });

  it("compares a date and time by its instant and a date by its day", () => {
    const instant = (value: string): CalculatedValue => ({ state: "value", value: { kind: "dateTime", value } });
    expect(currentDateValue("dateTime", instant("2026-11-13T10:00:00+01:00"))).toBe(
      normalisedDateValue({ kind: "dateTime", fieldValue: "2026-11-13T09:00:00.000Z" }),
    );
    expect(currentDateValue("dateTime", instant("2026-11-13T10:00:00+01:00"))).not.toBe(
      normalisedDateValue({ kind: "dateTime", fieldValue: "2026-11-13T10:00:00.000Z" }),
    );
    expect(currentDateValue("date", { state: "value", value: { kind: "text", value: "2026-11-13" } })).toBeNull();
    expect(currentDateValue("date", { state: "restricted" })).toBeNull();
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
    const limited = {
      ...createMockUserWithPermissions([{ resource: Resource.wiki, action: Action.readAll }]),
      id: OWNER,
      companyId: COMPANY,
    };
    const { interactor: instance } = interactor();
    expect(await run(instance, runId, limited)).toEqual({ ok: true, data: { status: "skipped" } });
    expect(repo.runs.get(runId)?.outcome).toMatchObject({ reason: "ownerNotPermitted" });
  });

  it("fails as invalid instead of running when the rule no longer fits the lists and fields", async () => {
    const outcome = async (ruleOverrides: Record<string, unknown>, model?: Record<string, unknown>) => {
      const store = new FakeAutomationRuleRepo();
      const runId = (await seedRun(store, ruleOverrides)) as string;
      const set = ports();
      if (model) set.records.model.mockResolvedValue(model);
      const instance = new RunAutomationRuleInteractor(store, set.runner, set.records as never, () => NOW);
      await run(instance, runId);
      const settled = store.runs.get(runId);
      return { status: settled?.status, error: settled?.error, notified: set.notifications.notify.mock.calls.length };
    };
    const current = (await ports().records.model()) as { types: unknown[]; fields: Array<{ id: string }> };
    const archivedStage = {
      ...current,
      fields: current.fields.map((field) => (field.id === STAGE ? { ...field, archived: true } : field)),
    };
    const stageIsEmpty = {
      triggerKind: "formSubmitted",
      trigger: { kind: "formSubmitted", typeId: TYPE },
      conditions: [{ fieldId: STAGE, operator: "empty" }],
    };

    expect(await outcome(stageIsEmpty, archivedStage)).toEqual({ status: "failed", error: "ruleInvalid", notified: 0 });
    expect(await outcome({}, { ...current, types: [{ id: TYPE, archived: true }] })).toEqual({
      status: "failed",
      error: "ruleInvalid",
      notified: 0,
    });
    expect(
      await outcome({ effects: [{ kind: "setField", fields: [{ fieldId: STAGE, value: null }] }] }, archivedStage),
    ).toMatchObject({ status: "failed", error: "ruleInvalid" });
    expect(await outcome({})).toMatchObject({ status: "applied", notified: 1 });
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
    const seen: Array<readonly string[] | undefined> = [];
    const set = ports();
    set.records.mutate.mockImplementation(() => {
      seen.push(currentCausation()?.ruleChain);
      return Promise.resolve({ ok: true, refs: [] });
    });
    const instance = new RunAutomationRuleInteractor(repo, set.runner, set.records as never, () => NOW);
    await run(instance, runId);
    expect(seen).toEqual([[RULE]]);
    expect(currentCausation()).toBeUndefined();
  });

  it("extends the chain it was started with", async () => {
    const runId = (await seedRun(repo, {
      effects: [{ kind: "setField", fields: [{ fieldId: STAGE, value: null }] }],
    })) as string;
    const started = repo.runs.get(runId);
    if (started) repo.runs.set(runId, { ...started, payload: { chain: [RULE_B] } });
    const seen: Array<readonly string[] | undefined> = [];
    const set = ports();
    set.records.mutate.mockImplementation(() => {
      seen.push(currentCausation()?.ruleChain);
      return Promise.resolve({ ok: true, refs: [] });
    });
    await run(new RunAutomationRuleInteractor(repo, set.runner, set.records as never, () => NOW), runId);
    expect(seen).toEqual([[RULE_B, RULE]]);
  });

  it("marks its changes as descending from a routine when a routine's change started it", async () => {
    const runId = (await seedRun(repo, {
      effects: [{ kind: "setField", fields: [{ fieldId: STAGE, value: null }] }],
    })) as string;
    const started = repo.runs.get(runId);
    if (started) repo.runs.set(runId, { ...started, payload: { chain: [], routineDepth: 1 } });
    const seen: unknown[] = [];
    const set = ports();
    set.records.mutate.mockImplementation(() => {
      seen.push(currentCausation());
      return Promise.resolve({ ok: true, refs: [] });
    });
    await run(new RunAutomationRuleInteractor(repo, set.runner, set.records as never, () => NOW), runId);
    expect(seen).toEqual([{ ruleChain: [RULE], routineDepth: 1 }]);
  });

  it("discards a run whose owner is gone and disables the rule", async () => {
    const runId = (await seedRun(repo)) as string;
    const discard = new DiscardAutomationRuleRunInteractor(repo, () => NOW);
    await expect(discard.invoke({ runId, companyId: COMPANY, reason: "ownerInactive" })).resolves.toEqual({
      discarded: true,
    });
    expect(repo.runs.get(runId)).toMatchObject({ status: "skipped" });
    expect(repo.rules.get(RULE)).toMatchObject({ enabled: false, disabledReason: "ownerInactive" });
    await expect(discard.invoke({ runId, companyId: COMPANY, reason: "ownerInactive" })).resolves.toEqual({
      discarded: false,
    });
  });
});

const UUID = (suffix: string) => `77777777-7777-4777-8777-${suffix.padStart(12, "0")}`;

function recordEvent(input: {
  id?: string;
  kind?: "record.created" | "record.updated";
  changed?: string[];
  after?: CalculatedValue;
  ruleChain?: string[];
  routineDepth?: number;
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
      cause: {
        kind: "mutation",
        ...(input.ruleChain ? { ruleChain: input.ruleChain } : {}),
        ...(input.routineDepth === undefined ? {} : { routineDepth: input.routineDepth }),
      },
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
  let reader: { findEventMatches: ReturnType<typeof vi.fn>; readEvent: ReturnType<typeof vi.fn> };
  let admission: AutomationRuleAdmission;
  beforeEach(() => {
    repo = new FakeAutomationRuleRepo();
    dispatch = vi.fn().mockResolvedValue(undefined);
    reader = {
      findEventMatches: vi.fn().mockResolvedValue([]),
      readEvent: vi.fn().mockResolvedValue({ event: "record.created" }),
    };
    admission = new AutomationRuleAdmission(repo, { dispatch } as never, reader as never, () => NOW);
  });

  const admit = (event: ReturnType<typeof recordEvent> | Record<string, unknown>) => admission.admit(event as never);

  const matchOf = (ruleId: string, subscription: Record<string, unknown> = {}, subscriptionRevision = 1) => ({
    companyId: COMPANY,
    eventId: UUID("1"),
    subscriptionId: ruleId,
    subscriptionRevision,
    subscription: { id: ruleId, kind: "rule", ownerUserId: OWNER, revision: 1, enabled: true, ...subscription },
  });
  const matched = (...matches: ReturnType<typeof matchOf>[]) => reader.findEventMatches.mockResolvedValue(matches);

  it("queues one run for an event the shared layer matched and hands it to the background worker", async () => {
    seedRule(repo);
    matched(matchOf(RULE));
    const event = recordEvent({});
    await admit(event);
    expect([...repo.runs.values()]).toHaveLength(1);
    expect(reader.findEventMatches).toHaveBeenCalledWith(event, "rule");
    expect(reader.readEvent).toHaveBeenCalledWith({
      companyId: COMPANY,
      userId: OWNER,
      eventId: event.id,
      subscriptionId: RULE,
    });
    expect(dispatch).toHaveBeenCalledWith("run-automation-rule", {
      runId: expect.any(String),
      companyId: COMPANY,
      ownerUserId: OWNER,
    });
    expect([...repo.runs.values()][0]).toMatchObject({
      occurrenceKey: `event:${UUID("1")}`,
      recordId: RECORD,
      typeId: TYPE,
    });
  });

  it("remembers on the run which revision of the rule's subscription matched the event", async () => {
    seedRule(repo);
    matched(matchOf(RULE, { revision: 4 }, 4));
    await admit(recordEvent({}));
    expect([...repo.runs.values()][0]?.payload).toMatchObject({ subscriptionRevision: 4 });
  });

  it("is idempotent when the same event is delivered twice", async () => {
    seedRule(repo);
    matched(matchOf(RULE));
    await admit(recordEvent({}));
    await admit(recordEvent({}));
    expect(repo.runs.size).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    await admit(recordEvent({ id: UUID("2") }));
    expect(repo.runs.size).toBe(2);
  });

  it("queues nothing when no subscription matched the event", async () => {
    seedRule(repo);
    await admit(recordEvent({}));
    expect(repo.runs.size).toBe(0);
    expect(reader.readEvent).not.toHaveBeenCalled();
  });

  it("ignores disabled rules and rules without an owner", async () => {
    seedRule(repo, { id: RULE, enabled: false });
    seedRule(repo, { id: UUID("a3"), ownerUserId: null });
    matched(matchOf(RULE), matchOf(UUID("a3")));
    await admit(recordEvent({}));
    expect(repo.runs.size).toBe(0);
  });

  it("ignores a match of a changed subscription or of another owner", async () => {
    seedRule(repo);
    matched(matchOf(RULE, { revision: 2 }));
    await admit(recordEvent({ id: UUID("3") }));
    matched(matchOf(RULE, { ownerUserId: OTHER_USER }));
    await admit(recordEvent({ id: UUID("4") }));
    expect(repo.runs.size).toBe(0);
    expect(reader.readEvent).not.toHaveBeenCalled();
  });

  it("queues nothing when the owner can no longer read the record", async () => {
    seedRule(repo);
    matched(matchOf(RULE));
    reader.readEvent.mockResolvedValue(null);
    await admit(recordEvent({}));
    expect(repo.runs.size).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("never lets a rule's own change start the same rule again", async () => {
    seedRule(repo);
    matched(matchOf(RULE));
    await admit(recordEvent({ ruleChain: [RULE] }));
    expect(repo.runs.size).toBe(0);
  });

  it("lets one rule's change start a different rule, but not a third", async () => {
    seedRule(repo);
    matched(matchOf(RULE));
    await admit(recordEvent({ ruleChain: [RULE_B], id: UUID("7") }));
    expect(repo.runs.size).toBe(1);
    expect([...repo.runs.values()][0]?.payload).toMatchObject({ chain: [RULE_B] });
    await admit(recordEvent({ ruleChain: [RULE_B, UUID("a4")], id: UUID("8") }));
    expect(repo.runs.size).toBe(1);
  });

  it("lets a routine's change start a rule and remembers that it came from a routine", async () => {
    seedRule(repo);
    matched(matchOf(RULE));
    await admit(recordEvent({ routineDepth: 1, id: UUID("16") }));
    expect(repo.runs.size).toBe(1);
    expect([...repo.runs.values()][0]?.payload).toMatchObject({ chain: [], routineDepth: 1 });
    await admit(recordEvent({ id: UUID("17") }));
    expect([...repo.runs.values()][1]?.payload).not.toHaveProperty("routineDepth");
  });

  it("ends the ping-pong between a rule and a routine after one hop each way", async () => {
    seedRule(repo, {
      triggerKind: "recordUpdated",
      trigger: { kind: "recordUpdated", typeId: TYPE, fieldIds: [] },
      effects: [{ kind: "createRecord", typeId: TASKS, fields: [], assignToRuleOwner: false, assignedUserIds: [] }],
    });
    matched(matchOf(RULE));
    const ROUTINE = UUID("b1");
    const routineRuns = vi.fn().mockResolvedValue([{ id: UUID("b2"), routineId: ROUTINE, executedByUserId: OWNER }]);
    const routineReader = {
      findEventMatches: vi.fn().mockResolvedValue([
        {
          subscriptionId: ROUTINE,
          subscriptionRevision: 1,
          subscription: { id: ROUTINE, kind: "routine", ownerUserId: OWNER, revision: 1, enabled: true },
        },
      ]),
      readEvent: vi.fn().mockResolvedValue({ event: "record.created" }),
    };
    const routines = new RoutineAdmission(
      {
        findEventRoutinesUnscoped: () =>
          Promise.resolve([{ id: ROUTINE, ownerUserId: OWNER, triggerFilters: [], updatedAt: NOW }]),
        admitEventRoutineRunsUnscoped: routineRuns,
      },
      { dispatch: vi.fn().mockResolvedValue(undefined) } as never,
      routineReader as never,
    );
    const set = ports();
    const causes: Array<Record<string, unknown>> = [];
    set.records.mutate.mockImplementation(() => {
      causes.push(recordCauseBy({}, { kind: "mutation" }));
      return Promise.resolve({ ok: true, refs: [{ typeId: TASKS, recordId: "created" }] });
    });
    const runner = new RunAutomationRuleInteractor(repo, set.runner, set.records as never, () => NOW);
    const runLatest = async () => {
      const latest = [...repo.runs.values()].at(-1);
      if (!latest) throw new Error("No run was admitted");
      await runWithTenant(mockUser, () => runner.invoke({ runId: latest.id }));
    };
    const taskCreated = (cause: Record<string, unknown>, id: string) => ({
      ...recordEvent({ id, kind: "record.created" }),
      payload: { ...recordEvent({ id }).payload, cause },
    });

    await admit(recordEvent({ kind: "record.updated", id: UUID("20") }));
    await runLatest();
    expect(causes[0]).toEqual({ kind: "mutation", ruleChain: [RULE] });
    await routines.admit(taskCreated(causes[0], UUID("21")) as never);
    expect(routineRuns).toHaveBeenCalledTimes(1);
    await admit(recordEvent({ kind: "record.updated", id: UUID("22"), routineDepth: 1 }));
    expect(repo.runs.size).toBe(2);
    await runLatest();
    expect(causes[1]).toEqual({ kind: "mutation", ruleChain: [RULE], routineDepth: 1 });
    await routines.admit(taskCreated(causes[1], UUID("23")) as never);
    expect(routineRuns).toHaveBeenCalledTimes(1);
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

  it("starts booking rules for the chosen change and booking page, and skips bookings without a record", async () => {
    const LINK = "6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a";
    seedRule(repo, {
      triggerKind: "bookingChanged",
      typeId: TYPE,
      trigger: { kind: "bookingChanged", change: "cancelled", typeId: TYPE, sourceId: LINK },
    });
    const changed = (id: string, extra: Record<string, unknown>) => ({
      id,
      companyId: COMPANY,
      kind: "booking.changed",
      subjectKind: "booking",
      payload: { typeId: TYPE, recordId: RECORD, bookingLinkId: LINK, change: "cancelled", by: "invitee", ...extra },
    });
    await admit(changed(UUID("16"), { change: "rescheduled" }));
    await admit(changed(UUID("17"), { bookingLinkId: "99999999-9999-4999-8999-999999999999" }));
    await admit(changed(UUID("18"), { recordId: null }));
    await admit(changed(UUID("19"), { typeId: null }));
    expect(repo.runs.size).toBe(0);
    await admit(changed(UUID("24"), {}));
    expect(repo.runs.size).toBe(1);
    expect([...repo.runs.values()][0]).toMatchObject({ recordId: RECORD, triggerKind: "bookingChanged" });
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
    sweep = new SweepAutomationRulesInteractor(repo, new FakeDateCandidateReader(repo), { dispatch } as never, discard);
    seedRule(repo, { triggerKind: "dateReached", trigger });
  });

  it("admits a run only for records the rule's owner may read", async () => {
    const hidden = "44444444-4444-4444-8444-444444444445";
    repo.candidates = [
      { recordId: RECORD, fieldValue: "2026-11-13" },
      { recordId: hidden, fieldValue: "2026-11-13" },
    ];
    repo.unreadableRecords.add(hidden);
    const reader = new FakeDateCandidateReader(repo);
    const discard = new DiscardAutomationRuleRunInteractor(repo, () => NOW);
    const scoped = new SweepAutomationRulesInteractor(repo, reader, { dispatch } as never, discard);
    await expect(scoped.invoke(new Date("2026-11-12T07:00:00.000Z"))).resolves.toMatchObject({
      automationRulesAdmitted: 1,
    });
    expect([...repo.runs.values()].map((run) => run.recordId)).toEqual([RECORD]);
    expect(reader.queries[0]).toMatchObject({ companyId: COMPANY, userId: OWNER, typeId: TYPE, fieldId: NEXT_STEP });
  });

  function pacedSweep(pacing: { budgetMs: number; stepMs: number; startAfter: string }) {
    let elapsed = 0;
    return new SweepAutomationRulesInteractor(
      repo,
      new FakeDateCandidateReader(repo),
      { dispatch } as never,
      new DiscardAutomationRuleRunInteractor(repo, () => NOW),
      undefined,
      undefined,
      {
        budgetMs: pacing.budgetMs,
        elapsed: () => {
          elapsed += pacing.stepMs;
          return elapsed;
        },
        startAfter: () => pacing.startAfter,
      },
    );
  }

  it("stops admitting date rules when its time is used up, so that stale runs still get their turn", async () => {
    for (const suffix of ["a2", "a3"])
      seedRule(repo, { id: RULE_B.replace("a2", suffix), triggerKind: "dateReached", trigger });
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-13" }];
    const stalled = (await repo.admitRunUnscoped({
      companyId: COMPANY,
      ruleId: RULE,
      occurrenceKey: "event:stalled",
      triggerKind: "dateReached",
      typeId: TYPE,
      recordId: RECORD,
      payload: { chain: [] },
      depth: 0,
      scheduledFor: NOW,
    })) as string;
    const queued = repo.runs.get(stalled);
    if (queued) repo.runs.set(stalled, { ...queued, createdAt: new Date("2026-11-12T06:50:00.000Z") });

    const short = pacedSweep({ budgetMs: 100, stepMs: 60, startAfter: "00000000-0000-0000-0000-000000000000" });
    await expect(short.invoke(new Date("2026-11-12T07:00:00.000Z"))).resolves.toEqual({
      automationRulesAdmitted: 1,
      automationRunsRedispatched: 1,
      automationRunsAbandoned: 0,
    });
    expect(dispatch).toHaveBeenCalledWith("run-automation-rule", {
      runId: stalled,
      companyId: COMPANY,
      ownerUserId: OWNER,
    });
  });

  it("starts each pass at another rule, so a short time still reaches every rule", async () => {
    const second = RULE_B;
    const third = RULE_B.replace("a2", "a3");
    for (const id of [second, third]) seedRule(repo, { id, triggerKind: "dateReached", trigger });
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-13" }];
    const admittedFor = () => [...repo.runs.values()].map((run) => run.ruleId).sort();
    const at = new Date("2026-11-12T07:00:00.000Z");

    await pacedSweep({ budgetMs: 100, stepMs: 60, startAfter: RULE }).invoke(at);
    expect(admittedFor()).toEqual([second]);
    await pacedSweep({ budgetMs: 100, stepMs: 60, startAfter: second }).invoke(at);
    expect(admittedFor()).toEqual([second, third]);
    await pacedSweep({ budgetMs: 100, stepMs: 60, startAfter: third }).invoke(at);
    expect(admittedFor()).toEqual([RULE, second, third]);
    await pacedSweep({ budgetMs: 10_000, stepMs: 1, startAfter: second }).invoke(at);
    expect(admittedFor()).toEqual([RULE, second, third]);
  });

  it("pages through every rule and every candidate instead of stopping at the first page", async () => {
    for (const suffix of ["a2", "a3", "a4"])
      seedRule(repo, { id: RULE_B.replace("a2", suffix), triggerKind: "dateReached", trigger });
    repo.candidates = ["1", "2", "3", "4", "5"].map((suffix) => ({
      recordId: `44444444-4444-4444-8444-44444444444${suffix}`,
      fieldValue: "2026-11-13",
    }));
    const discard = new DiscardAutomationRuleRunInteractor(repo, () => NOW);
    const paged = new SweepAutomationRulesInteractor(
      repo,
      new FakeDateCandidateReader(repo),
      { dispatch } as never,
      discard,
      { rules: 2, candidates: 2 },
    );
    await expect(paged.invoke(new Date("2026-11-12T07:00:00.000Z"))).resolves.toMatchObject({
      automationRulesAdmitted: 4 * 5,
    });
    expect(repo.runs.size).toBe(20);
    await expect(paged.invoke(new Date("2026-11-12T07:05:00.000Z"))).resolves.toMatchObject({
      automationRulesAdmitted: 0,
    });
  });

  it("fires once the offset date and hour are reached, and only once", async () => {
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-13" }];
    await expect(sweep.invoke(new Date("2026-11-12T06:59:00.000Z"))).resolves.toMatchObject({
      automationRulesAdmitted: 0,
    });
    await expect(sweep.invoke(new Date("2026-11-12T07:00:00.000Z"))).resolves.toMatchObject({
      automationRulesAdmitted: 1,
    });
    await expect(sweep.invoke(new Date("2026-11-12T07:05:00.000Z"))).resolves.toMatchObject({
      automationRulesAdmitted: 0,
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect([...repo.runs.values()][0]).toMatchObject({
      recordId: RECORD,
      occurrenceKey: `date:${RECORD}:${NEXT_STEP}:2026-11-13:before1`,
    });
  });

  it("reads the hour in the rule's time zone", async () => {
    seedRule(repo, {
      id: RULE_B,
      triggerKind: "dateReached",
      trigger: { ...trigger, timezone: "America/Los_Angeles" },
    });
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
    repo.candidates = [{ recordId: RECORD, kind: "dateTime", fieldValue: "2026-11-10T07:00:00.000Z" }];
    await expect(sweep.invoke(new Date("2026-11-12T06:59:00.000Z"))).resolves.toMatchObject({
      automationRulesAdmitted: 0,
    });
    await expect(sweep.invoke(new Date("2026-11-12T07:00:00.000Z"))).resolves.toMatchObject({
      automationRulesAdmitted: 1,
    });
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
    const old = new Date(NOW.getTime() - 5 * 60 * 1000);
    for (const [store, id] of [
      [repo, queued],
      [orphan, orphanRun],
    ] as const) {
      const run = store.runs.get(id);
      if (run) store.runs.set(id, { ...run, createdAt: old });
    }
    dispatch.mockClear();
    await expect(sweep.invoke(NOW)).resolves.toMatchObject({ automationRunsRedispatched: 1 });
    expect(dispatch).toHaveBeenCalledWith("run-automation-rule", {
      runId: queued,
      companyId: COMPANY,
      ownerUserId: OWNER,
    });
    const discardSweep = new SweepAutomationRulesInteractor(
      orphan,
      new FakeDateCandidateReader(orphan),
      { dispatch } as never,
      new DiscardAutomationRuleRunInteractor(orphan, () => NOW),
    );
    await discardSweep.invoke(NOW);
    expect(orphan.runs.get(orphanRun)?.status).toBe("skipped");
  });

  const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60 * 1000);

  async function stalledRun(store: FakeAutomationRuleRepo, createdMinutesAgo: number, key = "event:stalled") {
    const id = (await store.admitRunUnscoped({
      companyId: store.companyId,
      ruleId: RULE,
      occurrenceKey: key,
      triggerKind: "dateReached",
      typeId: TYPE,
      recordId: RECORD,
      payload: { chain: [] },
      depth: 0,
      scheduledFor: NOW,
    })) as string;
    const run = store.runs.get(id);
    if (run) {
      store.runs.set(id, {
        ...run,
        status: "running",
        createdAt: minutesAgo(createdMinutesAgo),
        startedAt: minutesAgo(11),
      });
    }
    return id;
  }

  it("tries a run that stayed running again while it is younger than half an hour", async () => {
    const runId = await stalledRun(repo, 25);
    dispatch.mockClear();
    await expect(sweep.invoke(NOW)).resolves.toMatchObject({
      automationRunsRedispatched: 1,
      automationRunsAbandoned: 0,
    });
    expect(dispatch).toHaveBeenCalledWith("run-automation-rule", { runId, companyId: COMPANY, ownerUserId: OWNER });
    expect(repo.runs.get(runId)?.status).toBe("running");
  });

  it("gives up on a run that is still unfinished half an hour after it was admitted", async () => {
    const running = await stalledRun(repo, 31);
    const queued = (await seedRun(repo, { id: RULE, triggerKind: "dateReached", trigger })) as string;
    const waiting = repo.runs.get(queued);
    if (waiting) repo.runs.set(queued, { ...waiting, createdAt: minutesAgo(45) });
    dispatch.mockClear();

    await expect(sweep.invoke(NOW)).resolves.toMatchObject({
      automationRunsRedispatched: 0,
      automationRunsAbandoned: 2,
    });
    expect(dispatch).not.toHaveBeenCalled();
    for (const id of [running, queued]) {
      expect(repo.runs.get(id)).toMatchObject({ status: "failed", error: "runAbandoned", finishedAt: NOW });
      expect(repo.runs.get(id)?.outcome).toEqual({ effects: [] });
    }
    expect(repo.rules.get(RULE)).toMatchObject({ enabled: true, lastRunStatus: "failed" });
    await expect(sweep.invoke(new Date(NOW.getTime() + 10 * 60 * 1000))).resolves.toMatchObject({
      automationRunsRedispatched: 0,
      automationRunsAbandoned: 0,
    });
  });

  it("leaves a run alone that a worker picked up in the meantime", async () => {
    const runId = await stalledRun(repo, 31);
    vi.spyOn(repo, "claimRunUnscoped").mockResolvedValueOnce(false);
    await expect(sweep.invoke(NOW)).resolves.toMatchObject({ automationRunsAbandoned: 0 });
    expect(repo.runs.get(runId)?.status).toBe("running");
  });

  it("takes stale runs of every workspace instead of the hundred oldest of one", async () => {
    const OTHER_COMPANY = "00000000-0000-4000-8000-000000000099";
    for (let index = 0; index < 120; index += 1) await stalledRun(repo, 20, `event:poisoned-${index}`);
    seedRule(repo, { id: RULE_B, companyId: OTHER_COMPANY, triggerKind: "dateReached", trigger });
    const neighbour = await stalledRun(repo, 15, "event:neighbour");
    const run = repo.runs.get(neighbour);
    if (run) repo.runs.set(neighbour, { ...run, companyId: OTHER_COMPANY, ruleId: RULE_B });
    dispatch.mockClear();

    await expect(sweep.invoke(NOW)).resolves.toMatchObject({ automationRunsRedispatched: 21 });
    expect(dispatch).toHaveBeenCalledWith("run-automation-rule", {
      runId: neighbour,
      companyId: OTHER_COMPANY,
      ownerUserId: OWNER,
    });
  });

  it("keeps going after a date rule or a stale run throws", async () => {
    seedRule(repo, { id: RULE_B, triggerKind: "dateReached", trigger });
    repo.candidates = [{ recordId: RECORD, fieldValue: "2026-11-13" }];
    const first = await stalledRun(repo, 20, "event:first");
    const second = await stalledRun(repo, 19, "event:second");
    const candidates = vi.spyOn(repo, "findDateCandidatesCompanyWide");
    candidates.mockRejectedValueOnce(new Error("model unavailable"));
    const refusing = vi.fn((_task: string, payload: { runId: string }) =>
      payload.runId === first ? Promise.reject(new Error("queue refused")) : Promise.resolve(undefined),
    );
    const report = vi.fn();
    const discard = new DiscardAutomationRuleRunInteractor(repo, () => NOW);
    const isolated = new SweepAutomationRulesInteractor(
      repo,
      new FakeDateCandidateReader(repo),
      { dispatch: refusing } as never,
      discard,
      undefined,
      report,
    );

    await expect(isolated.invoke(new Date("2026-11-12T08:00:00.000Z"))).resolves.toEqual({
      automationRulesAdmitted: 1,
      automationRunsRedispatched: 1,
      automationRunsAbandoned: 0,
    });
    expect(candidates).toHaveBeenCalledTimes(2);
    expect(refusing).toHaveBeenCalledWith("run-automation-rule", {
      runId: second,
      companyId: COMPANY,
      ownerUserId: OWNER,
    });
    expect(report.mock.calls.map(([, failure]) => failure)).toEqual([
      { companyId: COMPANY, ruleId: RULE },
      { companyId: COMPANY, runId: first },
    ]);
  });
});

describe("pruning rule runs", () => {
  it("deletes finished runs older than ninety days and keeps recent and unfinished ones", async () => {
    const repo = new FakeAutomationRuleRepo();
    const first = (await seedRun(repo)) as string;
    const template = repo.runs.get(first);
    if (!template) throw new Error("The run was not admitted");
    const day = 24 * 60 * 60 * 1000;
    const rows: Array<[string, "queued" | "applied" | "skipped" | "failed", number]> = [
      ["old-applied", "applied", 91],
      ["old-failed", "failed", 120],
      ["old-skipped", "skipped", 100],
      ["old-queued", "queued", 200],
      ["recent-applied", "applied", 89],
    ];
    repo.runs.clear();
    for (const [id, status, age] of rows)
      repo.runs.set(id, { ...template, id, status, createdAt: new Date(NOW.getTime() - age * day) });

    await expect(new PruneAutomationRuleRunsInteractor(repo).invoke({ now: NOW })).resolves.toEqual({ pruned: 3 });
    expect([...repo.runs.keys()].sort()).toEqual(["old-queued", "recent-applied"]);
    await expect(new PruneAutomationRuleRunsInteractor(repo).invoke({ now: NOW })).resolves.toEqual({ pruned: 0 });
  });
});
