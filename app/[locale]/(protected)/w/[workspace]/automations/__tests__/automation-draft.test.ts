import { describe, expect, it } from "vitest";

import type { RecordModelView } from "@/features/records/record-model.schema";
import type { AutomationRuleDto } from "@/features/automation-rules/automation-rule.schema";
import type { AutomationBuilderModel } from "../components/automation-builder-model";
import type { AutomationDraft, DraftCondition, DraftEffect, DraftReferences } from "../components/automation-draft";

import { automationModelIssues } from "@/features/automation-rules/automation-model-validation";
import { UpsertAutomationRuleSchema } from "@/features/automation-rules/automation-rule.schema";
import { toAutomationBuilderModel } from "../components/automation-builder-model";
import {
  blankAgentEffect,
  blankCondition,
  conditionOperatorsFor,
  draftToPreviewInput,
  draftToUpsert,
  draftUnavailable,
  effectsForTrigger,
  emptyChainDraft,
  emptyDraft,
  fieldTakesValue,
  linkRelationsFor,
  pickableWebhooks,
  reminderDraft,
  ruleToDraft,
  scalarFor,
  seedToDraft,
} from "../components/automation-draft";

const DEALS = "11111111-1111-4111-8111-111111111111";
const TASKS = "11111111-1111-4111-8111-222222222222";
const STAGE = "22222222-2222-4222-8222-222222222222";
const CLOSE = "22222222-2222-4222-8222-333333333333";
const AMOUNT = "22222222-2222-4222-8222-444444444444";
const TAGS = "22222222-2222-4222-8222-555555555555";
const FORMULA = "22222222-2222-4222-8222-666666666666";
const NAME = "22222222-2222-4222-8222-777777777777";
const TITLE = "22222222-2222-4222-8222-888888888888";
const DUE = "22222222-2222-4222-8222-999999999999";
const OWNER = "22222222-2222-4222-8222-aaaaaaaaaaa1";
const MEETING = "22222222-2222-4222-8222-aaaaaaaaaaa2";
const NOTES = "22222222-2222-4222-8222-aaaaaaaaaaa3";
const LABELS = "22222222-2222-4222-8222-aaaaaaaaaaa4";
const DONE = "22222222-2222-4222-8222-aaaaaaaaaaa5";
const SCORE = "22222222-2222-4222-8222-aaaaaaaaaaa6";
const GONE = "22222222-2222-4222-8222-ffffffffffff";
const MEMBER = "00000000-0000-4000-8000-0000000000b1";
const WEBHOOK = "66666666-6666-4666-8666-666666666666";
const RUNNER = "88888888-8888-4888-8888-888888888888";
const RELATION = "55555555-5555-4555-8555-555555555555";
const RULE = "00000000-0000-4000-8000-0000000000a1";

function field(id: string, typeId: string, valueType: string, extra: Record<string, unknown> = {}, kind = "input") {
  return {
    id,
    typeId,
    label: `field ${id.slice(-3)}`,
    valueType,
    behavior: { kind },
    archived: false,
    required: false,
    options: [],
    position: 0,
    ...extra,
  };
}

const RECORD_MODEL = {
  revision: 3,
  types: [
    { id: DEALS, label: "Deal", archived: false, embedded: false, position: 0, primaryFieldId: NAME },
    { id: TASKS, label: "Action", archived: false, embedded: false, position: 1, primaryFieldId: TITLE },
  ],
  fields: [
    field(NAME, DEALS, "text"),
    field(STAGE, DEALS, "select", {
      options: [
        { id: "won", label: "Won" },
        { id: "lost", label: "Lost" },
      ],
    }),
    field(CLOSE, DEALS, "date"),
    field(AMOUNT, DEALS, "currency", { format: { currency: "EUR" } }),
    field(TAGS, DEALS, "select", {
      multiple: true,
      options: [
        { id: "vip", label: "VIP" },
        { id: "new", label: "New" },
      ],
    }),
    field(FORMULA, DEALS, "number", {}, "formula"),
    field("22222222-2222-4222-8222-aaaaaaaaaaaa", DEALS, "file"),
    field(OWNER, DEALS, "member"),
    field(MEETING, DEALS, "dateTime"),
    field(NOTES, DEALS, "richText"),
    field(LABELS, DEALS, "text", { multiple: true }),
    field(DONE, DEALS, "boolean"),
    field(SCORE, DEALS, "number"),
    field(TITLE, TASKS, "text"),
    field(DUE, TASKS, "date"),
  ],
  relationships: [
    {
      id: RELATION,
      sourceTypeId: TASKS,
      targetTypeId: DEALS,
      sourceLabel: "Deal",
      targetLabel: "Actions",
      archived: false,
    },
  ],
} as unknown as RecordModelView;

const MODEL: AutomationBuilderModel = toAutomationBuilderModel(RECORD_MODEL);
const TZ = "Europe/Berlin";

function draft(overrides: Partial<AutomationDraft> = {}): AutomationDraft {
  return { ...emptyDraft(MODEL, { typeId: DEALS, timezone: TZ }), name: "Follow up", ...overrides };
}

function convert(value: AutomationDraft) {
  const result = draftToUpsert(value, MODEL);
  if (!result.ok) throw new Error(`expected a rule, got issues ${result.issues.join(", ")}`);
  return result.input;
}

function savedRule(overrides: Partial<AutomationRuleDto> = {}): AutomationRuleDto {
  return {
    id: RULE,
    ownerUserId: "u",
    owner: null,
    name: "Saved",
    enabled: true,
    trigger: { kind: "recordCreated", typeId: DEALS },
    conditions: [],
    effects: [
      {
        kind: "notify",
        recipients: { ruleOwner: true, assignees: false, userIds: [] },
        notificationKind: "ruleAlert",
        title: "{{record.name}}",
      },
    ],
    disabledReason: null,
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: "2026-11-12T08:00:00.000Z",
    updatedAt: "2026-11-12T08:00:00.000Z",
    ...overrides,
  };
}

describe("the builder model", () => {
  it("offers lists with their usable fields and marks calculated ones read-only", () => {
    expect(MODEL.lists.map((list) => list.label)).toEqual(["Deal", "Action"]);
    const deal = MODEL.lists[0];
    expect(deal?.fields.map((item) => item.id)).not.toContain("22222222-2222-4222-8222-aaaaaaaaaaaa");
    expect(deal?.fields.find((item) => item.id === FORMULA)?.writable).toBe(false);
    expect(deal?.fields.find((item) => item.id === AMOUNT)).toMatchObject({ writable: true, currency: "EUR" });
    expect(MODEL.relationships).toHaveLength(1);
  });
});

describe("values", () => {
  const stage = MODEL.lists[0]?.fields.find((item) => item.id === STAGE);
  const amount = MODEL.lists[0]?.fields.find((item) => item.id === AMOUNT);
  const tags = MODEL.lists[0]?.fields.find((item) => item.id === TAGS);
  const close = MODEL.lists[0]?.fields.find((item) => item.id === CLOSE);

  it("accepts only values the field can hold", () => {
    if (!stage || !amount || !tags || !close) throw new Error("fixture fields missing");
    expect(scalarFor(stage, "won")).toEqual({ kind: "select", value: "won" });
    expect(scalarFor(stage, "unknown")).toBeNull();
    expect(scalarFor(tags, "vip")).toEqual({ kind: "selectList", value: ["vip"] });
    expect(scalarFor(amount, "12.50")).toEqual({ kind: "decimal", value: "12.50", currency: "EUR" });
    expect(scalarFor(amount, "twelve")).toBeNull();
    expect(scalarFor(close, "2026-11-20")).toEqual({ kind: "date", value: "2026-11-20" });
    expect(scalarFor(close, "20.11.2026")).toBeNull();
  });
});

describe("turning a draft into a rule", () => {
  it("builds a valid rule from the default draft and stays valid against the model", () => {
    const input = convert(draft());
    expect(UpsertAutomationRuleSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      name: "Follow up",
      enabled: true,
      trigger: { kind: "recordUpdated", typeId: DEALS, fieldIds: [] },
    });
    const parsed = UpsertAutomationRuleSchema.parse(input);
    const { trigger, effects } = parsed;
    if (!trigger || !effects) throw new Error("the draft must produce a trigger and effects");
    expect(automationModelIssues({ trigger, conditions: parsed.conditions ?? [], effects }, RECORD_MODEL)).toEqual([]);
  });

  it("names every problem of an incomplete draft", () => {
    const bad = draft({
      name: " ",
      conditions: [blankCondition(STAGE)],
      effects: [
        { kind: "notify", toOwner: false, toAssignees: false, notificationKind: "ruleAlert", title: "", body: "" },
      ],
    });
    expect(draftToUpsert(bad, MODEL)).toEqual({ ok: false, issues: ["name", "conditions.0", "effects.0"] });
    expect(draftToUpsert(draft({ effects: [] }), MODEL)).toEqual({ ok: false, issues: ["effects"] });
  });

  it("builds a field-changed rule with the chosen value", () => {
    const value = draft({ trigger: { ...draft().trigger, kind: "fieldChanged", fieldId: STAGE, value: "won" } });
    expect(convert(value).trigger).toEqual({
      kind: "fieldChanged",
      typeId: DEALS,
      fieldId: STAGE,
      to: { kind: "select", value: "won" },
      timezone: TZ,
    });
    expect(
      draftToUpsert(
        draft({ trigger: { ...draft().trigger, kind: "fieldChanged", fieldId: STAGE, value: "nope" } }),
        MODEL,
      ).ok,
    ).toBe(false);
    expect(convert(draft({ trigger: { ...draft().trigger, kind: "fieldChanged", fieldId: STAGE } })).trigger).toEqual({
      kind: "fieldChanged",
      typeId: DEALS,
      fieldId: STAGE,
      timezone: TZ,
    });
  });

  it("sends the value a multiple choice field changed to as one option", () => {
    const value = draft({ trigger: { ...draft().trigger, kind: "fieldChanged", fieldId: TAGS, value: "vip" } });
    const input = convert(value);
    expect(input.trigger).toEqual({
      kind: "fieldChanged",
      typeId: DEALS,
      fieldId: TAGS,
      to: { kind: "select", value: "vip" },
      timezone: TZ,
    });
    const parsed = UpsertAutomationRuleSchema.parse(input);
    if (!parsed.trigger) throw new Error("the draft must produce a trigger");
    const opened = ruleToDraft(savedRule({ trigger: parsed.trigger }), MODEL, TZ);
    expect(opened.trigger).toMatchObject({ kind: "fieldChanged", fieldId: TAGS, value: "vip", kept: null });
    expect(
      draftToUpsert(draft({ trigger: { ...draft().trigger, kind: "fieldChanged", fieldId: TAGS, value: "nope" } }), MODEL)
        .ok,
    ).toBe(false);
  });

  it("sends the member's time zone on every trigger that is not a date trigger", () => {
    const base = draft().trigger;
    const kinds = ["recordCreated", "recordUpdated", "messageReceived", "formSubmitted", "webhookReceived"] as const;
    for (const kind of kinds) {
      const input = convert(draft({ trigger: { ...base, kind } }));
      expect(input.trigger, kind).toMatchObject({ kind, timezone: TZ });
      expect(UpsertAutomationRuleSchema.safeParse(input).success, kind).toBe(true);
    }
    const preview = draftToPreviewInput(draft({ conditions: [blankCondition(CLOSE, "before")] }), MODEL);
    expect(preview?.trigger).toMatchObject({ kind: "recordUpdated", timezone: TZ });
  });

  it("builds a reminder on a date field and refuses other fields, bad offsets and bad hours", () => {
    const reminder = reminderDraft(MODEL, { typeId: DEALS, fieldId: CLOSE, timezone: TZ });
    expect(convert({ ...reminder, name: "Remind me" }).trigger).toEqual({
      kind: "dateReached",
      typeId: DEALS,
      fieldId: CLOSE,
      days: 1,
      direction: "before",
      atHour: 8,
      timezone: TZ,
    });
    const patch = (override: Partial<AutomationDraft["trigger"]>) =>
      draftToUpsert({ ...reminder, name: "x", trigger: { ...reminder.trigger, ...override } }, MODEL).ok;
    expect(patch({ fieldId: STAGE })).toBe(false);
    expect(patch({ days: "-1" })).toBe(false);
    expect(patch({ days: "1.5" })).toBe(false);
    expect(patch({ atHour: "24" })).toBe(false);
    expect(patch({ timezone: "" })).toBe(false);
    expect(patch({ days: "0", direction: "after" })).toBe(true);
  });

  it("builds conditions, using the contains form for a multiple choice and relative days for dates", () => {
    const input = convert(
      draft({
        conditions: [
          { ...blankCondition(STAGE, "notEquals"), value: "lost" },
          { ...blankCondition(TAGS, "equals"), value: "vip" },
          blankCondition(AMOUNT, "notEmpty"),
          blankCondition(CLOSE, "before"),
          { ...blankCondition(CLOSE, "after"), value: "3" },
          { ...blankCondition(STAGE, "in"), values: ["won", "lost"] },
          { ...blankCondition(TAGS, "notIn"), values: ["vip"] },
        ],
      }),
    );
    expect(input.conditions).toEqual([
      { fieldId: STAGE, operator: "notEquals", value: { kind: "select", value: "lost" } },
      { fieldId: TAGS, operator: "in", values: [{ kind: "select", value: "vip" }] },
      { fieldId: AMOUNT, operator: "notEmpty" },
      { fieldId: CLOSE, operator: "before", relativeDays: 0 },
      { fieldId: CLOSE, operator: "after", relativeDays: 3 },
      {
        fieldId: STAGE,
        operator: "in",
        values: [
          { kind: "select", value: "won" },
          { kind: "select", value: "lost" },
        ],
      },
      { fieldId: TAGS, operator: "notIn", values: [{ kind: "select", value: "vip" }] },
    ]);
    const refused = (condition: DraftCondition) =>
      draftToUpsert(draft({ conditions: [condition] }), MODEL).ok === false;
    expect(refused(blankCondition(STAGE, "in"))).toBe(true);
    expect(refused({ ...blankCondition(STAGE, "in"), values: ["won", "nope"] })).toBe(true);
    expect(refused({ ...blankCondition(STAGE, "in"), values: ["won", "won"] })).toBe(true);
    expect(refused({ ...blankCondition(AMOUNT, "in"), values: ["1"] })).toBe(true);
    expect(UpsertAutomationRuleSchema.safeParse(input).success).toBe(true);
  });

  it("builds a task effect with a title, due date, owner and link, and a field effect", () => {
    const input = convert(
      draft({
        effects: [
          {
            kind: "createRecord",
            typeId: TASKS,
            titleFieldId: TITLE,
            title: "Call {{record.name}}",
            dueFieldId: DUE,
            dueDays: "2",
            assignToOwner: true,
            relationId: RELATION,
          },
          { kind: "setField", fieldId: STAGE, value: "won" },
        ],
      }),
    );
    expect(input.effects).toEqual([
      {
        kind: "createRecord",
        typeId: TASKS,
        title: { fieldId: TITLE, text: "Call {{record.name}}" },
        due: { fieldId: DUE, offsetDays: 2 },
        fields: [],
        assignToRuleOwner: true,
        assignedUserIds: [],
        link: { relationId: RELATION, direction: "outgoing" },
      },
      { kind: "setField", fields: [{ fieldId: STAGE, value: { kind: "select", value: "won" } }] },
    ]);
    expect(UpsertAutomationRuleSchema.safeParse(input).success).toBe(true);
  });

  it("refuses a link that does not join the two lists and drops it when the trigger no longer fits", () => {
    const task: DraftEffect = {
      kind: "createRecord",
      typeId: TASKS,
      titleFieldId: TITLE,
      title: "Call",
      dueFieldId: "",
      dueDays: "",
      assignToOwner: true,
      relationId: RELATION,
    };
    const onTasks = draft({ trigger: { ...draft().trigger, typeId: TASKS }, effects: [task] });
    expect(draftToUpsert(onTasks, MODEL)).toEqual({ ok: false, issues: ["effects.0"] });
    expect(effectsForTrigger([task], onTasks.trigger, MODEL)).toEqual([{ ...task, relationId: "" }]);
    expect(effectsForTrigger([task], { ...draft().trigger, kind: "messageReceived" }, MODEL)).toEqual([
      { ...task, relationId: "" },
    ]);
    expect(convert({ ...onTasks, effects: effectsForTrigger([task], onTasks.trigger, MODEL) }).effects).toMatchObject([
      { kind: "createRecord", typeId: TASKS },
    ]);
    const fitting = [task];
    expect(effectsForTrigger(fitting, draft().trigger, MODEL)).toBe(fitting);
    expect(linkRelationsFor(MODEL, TASKS, draft().trigger).map((relation) => relation.id)).toEqual([RELATION]);
    expect(linkRelationsFor(MODEL, TASKS, onTasks.trigger)).toEqual([]);
  });

  it("refuses a calculated field as a target and record effects on a message rule", () => {
    expect(draftToUpsert(draft({ effects: [{ kind: "setField", fieldId: FORMULA, value: "1" }] }), MODEL).ok).toBe(
      false,
    );
    const message = draft({ trigger: { ...draft().trigger, kind: "messageReceived" } });
    expect(draftToUpsert({ ...message, effects: [{ kind: "setField", fieldId: STAGE, value: "won" }] }, MODEL).ok).toBe(
      false,
    );
    const notifyOwner = convert(message);
    expect(notifyOwner.trigger).toEqual({ kind: "messageReceived", channel: "any", timezone: TZ });
    expect(convert({ ...message, trigger: { ...message.trigger, channel: "email" } }).trigger).toEqual({
      kind: "messageReceived",
      channel: "email",
      timezone: TZ,
    });
    const assignees = draft({
      trigger: { ...draft().trigger, kind: "messageReceived" },
      effects: [
        {
          kind: "notify",
          toOwner: false,
          toAssignees: true,
          notificationKind: "replyReceived",
          title: "Reply",
          body: "",
        },
      ],
    });
    expect(draftToUpsert(assignees, MODEL).ok).toBe(false);
  });
});

describe("opening a saved rule", () => {
  const rule: AutomationRuleDto = {
    id: RULE,
    ownerUserId: "u",
    owner: null,
    name: "Closing reminder",
    enabled: true,
    trigger: {
      kind: "dateReached",
      typeId: DEALS,
      fieldId: CLOSE,
      days: 2,
      direction: "before",
      atHour: 9,
      timezone: TZ,
    },
    conditions: [
      { fieldId: STAGE, operator: "equals", value: { kind: "select", value: "won" } },
      { fieldId: TAGS, operator: "in", values: [{ kind: "select", value: "vip" }] },
    ],
    effects: [
      {
        kind: "notify",
        recipients: { ruleOwner: true, assignees: false, userIds: [] },
        notificationKind: "dueToday",
        title: "{{record.name}}",
      },
      {
        kind: "createRecord",
        typeId: TASKS,
        title: { fieldId: TITLE, text: "Call" },
        due: { fieldId: DUE, offsetDays: 1 },
        fields: [],
        assignToRuleOwner: true,
        assignedUserIds: [],
        link: { relationId: RELATION, direction: "outgoing" },
      },
      { kind: "callWebhook", webhookId: "66666666-6666-4666-8666-666666666666" },
    ],
    disabledReason: null,
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: "2026-11-12T08:00:00.000Z",
    updatedAt: "2026-11-12T08:00:00.000Z",
  };

  it("round-trips through the builder without losing anything", () => {
    const opened = ruleToDraft(rule, MODEL, TZ);
    expect(opened.effects.at(-1)).toEqual({
      kind: "callWebhook",
      webhookId: "66666666-6666-4666-8666-666666666666",
    });
    const saved = convert(opened);
    expect(saved).toEqual({
      id: RULE,
      name: "Closing reminder",
      enabled: true,
      trigger: rule.trigger,
      conditions: rule.conditions,
      effects: rule.effects,
    });
  });

  it("keeps a trigger the builder does not offer and still lets the rest be edited", () => {
    const trigger = {
      kind: "formSubmitted" as const,
      typeId: DEALS,
      sourceId: "77777777-7777-4777-8777-777777777777",
    };
    const opened = ruleToDraft({ ...rule, trigger, conditions: [] }, MODEL, TZ);
    expect(opened.trigger.kind).toBe("other");
    const saved = convert({ ...opened, name: "Renamed" });
    expect(saved.trigger).toEqual({ ...trigger, timezone: TZ });
    expect(saved.name).toBe("Renamed");
  });

  it("keeps the time zone a rule already carries and reads today in the member's zone when it has none", () => {
    const own = "America/New_York";
    const editable = { kind: "recordCreated" as const, typeId: DEALS, timezone: own };
    const openedEditable = ruleToDraft({ ...rule, trigger: editable, conditions: [] }, MODEL, TZ);
    expect(openedEditable.trigger).toMatchObject({ kind: "recordCreated", timezone: own });
    expect(convert(openedEditable).trigger).toEqual(editable);

    const kept = { kind: "formSubmitted" as const, sourceId: "77777777-7777-4777-8777-777777777777", timezone: own };
    const openedKept = ruleToDraft(
      { ...rule, trigger: kept, conditions: [], effects: rule.effects.slice(0, 1) },
      MODEL,
      TZ,
    );
    expect(openedKept.trigger.kind).toBe("other");
    expect(convert(openedKept).trigger).toEqual(kept);

    const bare = ruleToDraft({ ...rule, trigger: { kind: "recordCreated", typeId: DEALS }, conditions: [] }, MODEL, TZ);
    expect(bare.trigger).toMatchObject({ kind: "recordCreated", timezone: TZ });
    expect(convert(bare).trigger).toEqual({ kind: "recordCreated", typeId: DEALS, timezone: TZ });
  });

  it("edits a form or webhook trigger with an optional list", () => {
    const anyForm = ruleToDraft(
      { ...rule, trigger: { kind: "formSubmitted" }, conditions: [], effects: rule.effects.slice(0, 1) },
      MODEL,
      TZ,
    );
    expect(anyForm.trigger).toMatchObject({ kind: "formSubmitted", typeId: "" });
    expect(convert(anyForm).trigger).toEqual({ kind: "formSubmitted", timezone: TZ });
    const listed = { ...anyForm, trigger: { ...anyForm.trigger, kind: "webhookReceived" as const, typeId: DEALS } };
    expect(convert(listed).trigger).toEqual({ kind: "webhookReceived", typeId: DEALS, timezone: TZ });
    expect(draftToUpsert({ ...listed, trigger: { ...listed.trigger, typeId: "missing" } }, MODEL)).toEqual({
      ok: false,
      issues: ["trigger"],
    });
  });

  it("opens and saves an agent step with its runtime, model and runner", () => {
    const runner = "88888888-8888-4888-8888-888888888888";
    const effects = [
      { kind: "agent" as const, runtime: "ownKey" as const, prompt: "Summarise {{record.name}}", model: "m-1" },
      { kind: "agent" as const, runtime: "runner" as const, prompt: "Check it", runnerId: runner },
      { kind: "agent" as const, runtime: "mate" as const, prompt: "Draft a reply" },
    ];
    const opened = ruleToDraft({ ...rule, effects }, MODEL, TZ);
    expect(opened.effects).toEqual([
      { kind: "agent", runtime: "ownKey", prompt: "Summarise {{record.name}}", model: "m-1", runnerId: "" },
      { kind: "agent", runtime: "runner", prompt: "Check it", model: "", runnerId: runner },
      { kind: "agent", runtime: "mate", prompt: "Draft a reply", model: "", runnerId: "" },
    ]);
    expect(convert(opened).effects).toEqual(effects);
  });

  it("drops a model on a non-own-key step and refuses an empty prompt or a webhook-less step", () => {
    const stale = {
      ...draft(),
      effects: [{ kind: "agent" as const, runtime: "mate" as const, prompt: " Go ", model: "m-1", runnerId: "x" }],
    };
    expect(convert(stale).effects).toEqual([{ kind: "agent", runtime: "mate", prompt: "Go" }]);
    const blank = { ...draft(), effects: [blankAgentEffect("ownKey")] };
    expect(draftToUpsert(blank, MODEL)).toEqual({ ok: false, issues: ["effects.0"] });
    const webhook = { ...draft(), effects: [{ kind: "callWebhook" as const, webhookId: "" }] };
    expect(draftToUpsert(webhook, MODEL)).toEqual({ ok: false, issues: ["effects.0"] });
  });

  it("starts from scratch with an empty chain that cannot be saved before a step is added", () => {
    const chain = emptyChainDraft(MODEL, { typeId: DEALS, timezone: TZ });
    expect(chain.effects).toEqual([]);
    expect(draftToUpsert({ ...chain, name: "x" }, MODEL)).toEqual({ ok: false, issues: ["effects"] });
  });

  it("keeps effects with several recipients as they are", () => {
    const effect = {
      kind: "notify" as const,
      recipients: { ruleOwner: true, assignees: false, userIds: ["00000000-0000-4000-8000-0000000000b1"] },
      notificationKind: "ruleAlert" as const,
      title: "x",
    };
    const opened = ruleToDraft({ ...rule, effects: [effect] }, MODEL, TZ);
    expect(opened.effects).toEqual([{ kind: "kept", effect }]);
  });
});

const select = (value: string) => ({ kind: "select" as const, value });
const NOTIFY = {
  kind: "notify" as const,
  recipients: { ruleOwner: true, assignees: false, userIds: [] },
  notificationKind: "ruleAlert" as const,
  title: "{{record.name}}",
};
const ON_UPDATE = { kind: "recordUpdated" as const, typeId: DEALS, fieldIds: [] };
const SOURCE = "77777777-7777-4777-8777-777777777777";

const TRIGGER_SHAPES: Array<[string, Record<string, unknown>, "editable" | "kept"]> = [
  ["a record is created", { kind: "recordCreated", typeId: DEALS }, "editable"],
  ["any field is updated", ON_UPDATE, "editable"],
  ["one of several fields is updated", { ...ON_UPDATE, fieldIds: [STAGE, CLOSE] }, "editable"],
  ["a field the builder does not offer is updated", { ...ON_UPDATE, fieldIds: [STAGE, NOTES] }, "kept"],
  ["a field changes", { kind: "fieldChanged", typeId: DEALS, fieldId: STAGE }, "editable"],
  [
    "a field changes to an option",
    { kind: "fieldChanged", typeId: DEALS, fieldId: STAGE, to: select("won") },
    "editable",
  ],
  [
    "a multiple choice changes to one option",
    { kind: "fieldChanged", typeId: DEALS, fieldId: TAGS, to: { kind: "select", value: "vip" } },
    "editable",
  ],
  [
    "a multiple choice changes to a list of one option",
    { kind: "fieldChanged", typeId: DEALS, fieldId: TAGS, to: { kind: "selectList", value: ["vip"] } },
    "kept",
  ],
  [
    "a multiple choice changes to several options",
    { kind: "fieldChanged", typeId: DEALS, fieldId: TAGS, to: { kind: "selectList", value: ["vip", "new"] } },
    "kept",
  ],
  [
    "a member field changes to a member",
    { kind: "fieldChanged", typeId: DEALS, fieldId: OWNER, to: { kind: "member", value: MEMBER } },
    "kept",
  ],
  ["a member field changes", { kind: "fieldChanged", typeId: DEALS, fieldId: OWNER }, "editable"],
  [
    "a date is reached",
    { kind: "dateReached", typeId: DEALS, fieldId: CLOSE, days: 3, direction: "after", atHour: 7, timezone: TZ },
    "editable",
  ],
  [
    "a date and time is reached",
    { kind: "dateReached", typeId: DEALS, fieldId: MEETING, days: 0, direction: "before", atHour: 8, timezone: "UTC" },
    "editable",
  ],
  ["any message arrives", { kind: "messageReceived", channel: "any" }, "editable"],
  ["an email arrives", { kind: "messageReceived", channel: "email" }, "editable"],
  ["a chat message arrives", { kind: "messageReceived", channel: "chat" }, "editable"],
  ["any form is submitted", { kind: "formSubmitted" }, "editable"],
  ["a form creates a record in a list", { kind: "formSubmitted", typeId: DEALS }, "editable"],
  ["one form is submitted", { kind: "formSubmitted", sourceId: SOURCE }, "kept"],
  ["one form creates a record in a list", { kind: "formSubmitted", typeId: DEALS, sourceId: SOURCE }, "kept"],
  ["any webhook delivers", { kind: "webhookReceived" }, "editable"],
  ["a webhook delivers into a list", { kind: "webhookReceived", typeId: DEALS }, "editable"],
  ["one webhook endpoint delivers", { kind: "webhookReceived", typeId: DEALS, sourceId: SOURCE }, "kept"],
];

const CONDITION_SHAPES: Array<[string, Record<string, unknown>, "editable" | "kept"]> = [
  ["a choice is an option", { fieldId: STAGE, operator: "equals", value: select("won") }, "editable"],
  ["a choice is not an option", { fieldId: STAGE, operator: "notEquals", value: select("lost") }, "editable"],
  [
    "a choice is one of several",
    { fieldId: STAGE, operator: "in", values: [select("won"), select("lost")] },
    "editable",
  ],
  ["a choice is one of one", { fieldId: STAGE, operator: "in", values: [select("won")] }, "editable"],
  [
    "a choice is none of several",
    { fieldId: STAGE, operator: "notIn", values: [select("won"), select("lost")] },
    "editable",
  ],
  ["a multiple choice contains an option", { fieldId: TAGS, operator: "in", values: [select("vip")] }, "editable"],
  [
    "a multiple choice contains none of several",
    { fieldId: TAGS, operator: "notIn", values: [select("vip"), select("new")] },
    "editable",
  ],
  [
    "a multiple choice is exactly a set",
    { fieldId: TAGS, operator: "equals", value: { kind: "selectList", value: ["vip", "new"] } },
    "kept",
  ],
  [
    "a text list contains a text",
    { fieldId: LABELS, operator: "in", values: [{ kind: "text", value: "priority" }] },
    "kept",
  ],
  [
    "an amount equals",
    { fieldId: AMOUNT, operator: "equals", value: { kind: "decimal", value: "12.50", currency: "EUR" } },
    "editable",
  ],
  [
    "an amount equals in another currency",
    { fieldId: AMOUNT, operator: "equals", value: { kind: "decimal", value: "12.50", currency: "USD" } },
    "kept",
  ],
  [
    "a number differs",
    { fieldId: SCORE, operator: "notEquals", value: { kind: "decimal", value: "3", currency: null } },
    "editable",
  ],
  ["a checkbox is set", { fieldId: DONE, operator: "equals", value: { kind: "boolean", value: true } }, "editable"],
  ["a text equals", { fieldId: NAME, operator: "equals", value: { kind: "text", value: "Acme" } }, "editable"],
  ["a date equals", { fieldId: CLOSE, operator: "equals", value: { kind: "date", value: "2026-12-31" } }, "editable"],
  [
    "a date and time equals",
    { fieldId: MEETING, operator: "equals", value: { kind: "dateTime", value: "2026-12-31T10:00:00Z" } },
    "kept",
  ],
  ["a member equals", { fieldId: OWNER, operator: "equals", value: { kind: "member", value: MEMBER } }, "kept"],
  ["a member is one of", { fieldId: OWNER, operator: "in", values: [{ kind: "member", value: MEMBER }] }, "kept"],
  ["a field is empty", { fieldId: OWNER, operator: "empty" }, "editable"],
  ["a field is not empty", { fieldId: MEETING, operator: "notEmpty" }, "editable"],
  ["a formatted text is empty", { fieldId: NOTES, operator: "empty" }, "kept"],
  ["a date is before today", { fieldId: CLOSE, operator: "before", relativeDays: 0 }, "editable"],
  ["a date is before a past day", { fieldId: CLOSE, operator: "before", relativeDays: -3 }, "editable"],
  ["a date and time is after a future day", { fieldId: MEETING, operator: "after", relativeDays: 5 }, "editable"],
  [
    "a date is before a fixed date",
    { fieldId: CLOSE, operator: "before", value: { kind: "date", value: "2026-12-31" } },
    "kept",
  ],
  [
    "a date and time is after a fixed instant",
    { fieldId: MEETING, operator: "after", value: { kind: "dateTime", value: "2026-12-31T10:00:00+01:00" } },
    "kept",
  ],
  [
    "a date is before a fixed date with a relative day beside it",
    { fieldId: CLOSE, operator: "before", value: { kind: "date", value: "2026-12-31" }, relativeDays: 2 },
    "kept",
  ],
];

const setTo = (fieldId: string, value: unknown) => ({ kind: "setField", fields: [{ fieldId, value }] });
const CREATE = {
  kind: "createRecord",
  typeId: TASKS,
  title: { fieldId: TITLE, text: "Call {{record.name}}" },
  fields: [],
  assignToRuleOwner: false,
  assignedUserIds: [],
};

const EFFECT_SHAPES: Array<[string, Record<string, unknown>, "editable" | "kept"]> = [
  ["set a choice", setTo(STAGE, select("won")), "editable"],
  ["set a multiple choice to one option", setTo(TAGS, { kind: "selectList", value: ["vip"] }), "editable"],
  ["set a multiple choice to several options", setTo(TAGS, { kind: "selectList", value: ["vip", "new"] }), "kept"],
  ["set a text", setTo(NAME, { kind: "text", value: "Renamed" }), "editable"],
  ["set an amount", setTo(AMOUNT, { kind: "decimal", value: "99", currency: "EUR" }), "editable"],
  ["set a checkbox", setTo(DONE, { kind: "boolean", value: false }), "editable"],
  ["set a date", setTo(CLOSE, { kind: "date", value: "2027-01-31" }), "editable"],
  ["set a date and time", setTo(MEETING, { kind: "dateTime", value: "2027-01-31T09:00:00Z" }), "kept"],
  ["set a member", setTo(OWNER, { kind: "member", value: MEMBER }), "kept"],
  ["set a text list", setTo(LABELS, { kind: "textList", value: ["a", "b"] }), "kept"],
  ["clear a field", setTo(NAME, null), "kept"],
  [
    "set several fields",
    {
      kind: "setField",
      fields: [
        { fieldId: STAGE, value: select("won") },
        { fieldId: NAME, value: { kind: "text", value: "Won" } },
      ],
    },
    "kept",
  ],
  ["create a record", CREATE, "editable"],
  [
    "create a record with a due date, an owner and a link",
    {
      ...CREATE,
      due: { fieldId: DUE, offsetDays: -2 },
      assignToRuleOwner: true,
      link: { relationId: RELATION, direction: "outgoing" },
    },
    "editable",
  ],
  ["create a record without a title", { ...CREATE, title: undefined }, "kept"],
  [
    "create a record with further fields",
    { ...CREATE, fields: [{ fieldId: DUE, value: { kind: "date", value: "2027-01-31" } }] },
    "kept",
  ],
  ["create a record assigned to members", { ...CREATE, assignedUserIds: [MEMBER] }, "kept"],
  ["notify the owner", NOTIFY, "editable"],
  [
    "notify the assignees with details",
    {
      ...NOTIFY,
      recipients: { ruleOwner: false, assignees: true, userIds: [] },
      body: "Look at it",
      notificationKind: "dueToday",
    },
    "editable",
  ],
  [
    "notify chosen members",
    { ...NOTIFY, recipients: { ruleOwner: false, assignees: false, userIds: [MEMBER] } },
    "kept",
  ],
  ["call a webhook", { kind: "callWebhook", webhookId: WEBHOOK }, "editable"],
  ["ask Mate", { kind: "agent", runtime: "mate", prompt: "Draft a reply" }, "editable"],
  ["ask the own key with a model", { kind: "agent", runtime: "ownKey", prompt: "Summarise", model: "m-1" }, "editable"],
  ["ask a named runner", { kind: "agent", runtime: "runner", prompt: "Check it", runnerId: RUNNER }, "editable"],
  ["ask Mate with a model left on it", { kind: "agent", runtime: "mate", prompt: "Draft", model: "m-1" }, "kept"],
];

function stored(parts: { trigger?: unknown; conditions?: unknown[]; effects?: unknown[] }): AutomationRuleDto {
  const parsed = UpsertAutomationRuleSchema.parse({
    name: "Made over the API",
    trigger: parts.trigger ?? ON_UPDATE,
    conditions: parts.conditions ?? [],
    effects: parts.effects ?? [NOTIFY],
  });
  if (!parsed.trigger || !parsed.effects) throw new Error("the fixture must be a complete rule");
  return {
    id: RULE,
    ownerUserId: "u",
    owner: null,
    name: "Made over the API",
    enabled: true,
    trigger: parsed.trigger,
    conditions: parsed.conditions ?? [],
    effects: parsed.effects,
    disabledReason: null,
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: "2026-11-12T08:00:00.000Z",
    updatedAt: "2026-11-12T08:00:00.000Z",
  };
}

function renamed(rule: AutomationRuleDto) {
  return convert({ ...ruleToDraft(rule, MODEL, TZ), name: "Renamed in the builder" });
}

describe("opening a rule and saving it with only a new name", () => {
  it.each(TRIGGER_SHAPES)("keeps the trigger when %s", (_name, trigger, mode) => {
    const rule = stored({ trigger, effects: [NOTIFY] });
    const opened = ruleToDraft(rule, MODEL, TZ);

    expect(opened.trigger.kind === "other" ? "kept" : "editable").toBe(mode);
    expect(renamed(rule)).toEqual({
      id: RULE,
      name: "Renamed in the builder",
      enabled: true,
      trigger: rule.trigger.kind === "dateReached" ? rule.trigger : { ...rule.trigger, timezone: TZ },
      conditions: [],
      effects: rule.effects,
    });
  });

  it.each(CONDITION_SHAPES)("keeps the condition when %s", (_name, condition, mode) => {
    const rule = stored({ conditions: [condition] });
    const opened = ruleToDraft(rule, MODEL, TZ);

    expect(opened.conditions[0]?.kept ? "kept" : "editable").toBe(mode);
    expect(renamed(rule).conditions).toEqual(rule.conditions);
  });

  it.each(EFFECT_SHAPES)("keeps the step when it is to %s", (_name, effect, mode) => {
    const rule = stored({ effects: [effect] });
    const opened = ruleToDraft(rule, MODEL, TZ);

    expect(opened.effects[0]?.kind === "kept" ? "kept" : "editable").toBe(mode);
    expect(renamed(rule).effects).toEqual(rule.effects);
  });

  it("does not turn 'stage is won or lost' into 'stage is won'", () => {
    const rule = stored({ conditions: [{ fieldId: STAGE, operator: "in", values: [select("won"), select("lost")] }] });
    const opened = ruleToDraft(rule, MODEL, TZ);

    expect(opened.conditions).toEqual([
      { fieldId: STAGE, operator: "in", value: "", values: ["won", "lost"], kept: null },
    ]);
    expect(renamed(rule).conditions).toEqual([
      { fieldId: STAGE, operator: "in", values: [select("won"), select("lost")] },
    ]);
  });

  it("shows composer output it cannot edit as kept steps instead of narrowing it", () => {
    const condition = {
      fieldId: CLOSE,
      operator: "before" as const,
      value: { kind: "date" as const, value: "2026-12-31" },
    };
    const effect = {
      kind: "setField" as const,
      fields: [{ fieldId: OWNER, value: { kind: "member" as const, value: MEMBER } }],
    };
    const seeded = seedToDraft(
      { name: "Drafted", enabled: true, trigger: ON_UPDATE, conditions: [condition], effects: [effect] },
      MODEL,
      TZ,
    );

    expect(seeded.id).toBeUndefined();
    expect(seeded.conditions[0]?.kept).toEqual(condition);
    expect(seeded.effects).toEqual([{ kind: "kept", effect }]);
    expect(convert(seeded)).toMatchObject({ conditions: [condition], effects: [effect] });
  });
});

describe("fields the builder offers", () => {
  const dealField = (id: string) => {
    const found = MODEL.lists[0]?.fields.find((item) => item.id === id);
    if (!found) throw new Error(`fixture field ${id} missing`);
    return found;
  };

  it("offers only comparisons a field can be saved with", () => {
    expect(conditionOperatorsFor(dealField(OWNER))).toEqual(["empty", "notEmpty"]);
    expect(conditionOperatorsFor(dealField(MEETING))).toEqual(["empty", "notEmpty", "before", "after"]);
    expect(conditionOperatorsFor(dealField(LABELS))).toEqual(["empty", "notEmpty"]);
    expect(conditionOperatorsFor(dealField(CLOSE))).toEqual([
      "equals",
      "notEquals",
      "empty",
      "notEmpty",
      "before",
      "after",
    ]);
    expect(conditionOperatorsFor(dealField(STAGE))).toEqual([
      "equals",
      "notEquals",
      "in",
      "notIn",
      "empty",
      "notEmpty",
    ]);
    expect(conditionOperatorsFor(dealField(TAGS))).toEqual(["in", "notIn", "empty", "notEmpty"]);
    expect(conditionOperatorsFor(undefined)).toEqual(["equals", "notEquals", "empty", "notEmpty"]);
  });

  it("every comparison offered for a field converts to a rule the server accepts", () => {
    for (const item of MODEL.lists[0]?.fields ?? []) {
      for (const operator of conditionOperatorsFor(item)) {
        const sample =
          operator === "before" || operator === "after"
            ? "5"
            : item.valueType === "select"
              ? (item.options[0]?.id ?? "")
              : item.valueType === "boolean"
                ? "true"
                : item.valueType === "date"
                  ? "2026-12-31"
                  : item.valueType === "text" || item.valueType === "url"
                    ? "Acme"
                    : "5";
        const condition = { ...blankCondition(item.id, operator), value: sample, values: [sample] };
        const converted = draftToUpsert(draft({ conditions: [condition] }), MODEL);

        expect(converted.ok, `${item.valueType} ${operator}`).toBe(true);
        if (converted.ok) {
          expect(UpsertAutomationRuleSchema.safeParse(converted.input).success, `${item.valueType} ${operator}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("takes a typed value only for fields that can hold one", () => {
    expect(fieldTakesValue(dealField(OWNER))).toBe(false);
    expect(fieldTakesValue(dealField(MEETING))).toBe(false);
    expect(fieldTakesValue(dealField(LABELS))).toBe(false);
    expect(fieldTakesValue(dealField(TAGS))).toBe(true);
    expect(fieldTakesValue(dealField(SCORE))).toBe(true);
    expect(scalarFor(dealField(LABELS), "priority")).toBeNull();
    expect(scalarFor(dealField(OWNER), MEMBER)).toBeNull();
    expect(scalarFor(dealField(SCORE), "3")).toEqual({ kind: "decimal", value: "3", currency: null });
  });
});

describe("references that are no longer available", () => {
  const references = (overrides: Partial<DraftReferences> = {}): DraftReferences => ({
    model: MODEL,
    webhooks: [{ id: WEBHOOK, subscribed: true }],
    runtimes: {
      ownKey: { available: true, models: [{ id: "m-1" }] },
      runner: { reason: null, runners: [{ id: RUNNER }] },
    },
    ...overrides,
  });
  const unavailableOf = (rule: AutomationRuleDto, overrides: Partial<DraftReferences> = {}) =>
    draftUnavailable(ruleToDraft(rule, MODEL, TZ), references(overrides));

  it("finds nothing on a rule whose references all exist", () => {
    const rule = stored({
      trigger: { kind: "fieldChanged", typeId: DEALS, fieldId: STAGE, to: select("won") },
      conditions: [{ fieldId: STAGE, operator: "in", values: [select("won"), select("lost")] }],
      effects: [
        { kind: "callWebhook", webhookId: WEBHOOK },
        { kind: "agent", runtime: "runner", prompt: "Check", runnerId: RUNNER },
        { kind: "agent", runtime: "ownKey", prompt: "Check", model: "m-1" },
        setTo(STAGE, select("lost")),
      ],
    });

    expect(unavailableOf(rule)).toEqual([]);
  });

  it("names a deleted list, field and option on the card that uses it and refuses to save", () => {
    const missingList = stored({ trigger: { kind: "recordCreated", typeId: GONE } });
    expect(unavailableOf(missingList)).toEqual([{ card: "trigger", what: "list" }]);
    expect(draftToUpsert(ruleToDraft(missingList, MODEL, TZ), MODEL).ok).toBe(false);

    const missingField = stored({
      trigger: { ...ON_UPDATE, fieldIds: [STAGE, GONE] },
      conditions: [{ fieldId: GONE, operator: "in", values: [select("a"), select("b")] }],
      effects: [setTo(GONE, select("won"))],
    });
    const opened = ruleToDraft(missingField, MODEL, TZ);
    expect(opened.trigger.kind).toBe("recordUpdated");
    expect(opened.conditions[0]?.kept).toBeNull();
    expect(opened.effects[0]?.kind).toBe("setField");
    expect(draftUnavailable(opened, references())).toEqual([
      { card: "trigger", what: "field" },
      { card: "conditions.0", what: "field" },
      { card: "effects.0", what: "field" },
    ]);
    expect(draftToUpsert(opened, MODEL)).toEqual({ ok: false, issues: ["trigger", "conditions.0", "effects.0"] });

    const missingOption = stored({
      trigger: { kind: "fieldChanged", typeId: DEALS, fieldId: STAGE, to: select("archived") },
      conditions: [
        { fieldId: STAGE, operator: "equals", value: select("archived") },
        { fieldId: STAGE, operator: "in", values: [select("won"), select("archived")] },
      ],
      effects: [setTo(STAGE, select("archived"))],
    });
    expect(unavailableOf(missingOption)).toEqual([
      { card: "trigger", what: "option" },
      { card: "conditions.0", what: "option" },
      { card: "conditions.1", what: "option" },
      { card: "effects.0", what: "option" },
    ]);
    expect(draftToUpsert(ruleToDraft(missingOption, MODEL, TZ), MODEL).ok).toBe(false);
  });

  it("names a webhook, runner or model that is gone", () => {
    const rule = stored({
      effects: [
        { kind: "callWebhook", webhookId: WEBHOOK },
        { kind: "agent", runtime: "runner", prompt: "Check", runnerId: RUNNER },
        { kind: "agent", runtime: "ownKey", prompt: "Check", model: "m-1" },
      ],
    });

    expect(
      unavailableOf(rule, {
        webhooks: [],
        runtimes: { ownKey: { available: true, models: [{ id: "m-2" }] }, runner: { reason: "noRunner", runners: [] } },
      }),
    ).toEqual([
      { card: "effects.0", what: "webhook" },
      { card: "effects.1", what: "runner" },
      { card: "effects.2", what: "model" },
    ]);
  });

  it("names a webhook that has not selected the automation event, and offers only webhooks that have", () => {
    const rule = stored({ effects: [{ kind: "callWebhook", webhookId: WEBHOOK }] });
    const silent = { id: WEBHOOK, subscribed: false };
    const other = { id: "66666666-6666-4666-8666-777777777777", subscribed: true };

    expect(unavailableOf(rule, { webhooks: [silent, other] })).toEqual([{ card: "effects.0", what: "webhookEvent" }]);
    expect(unavailableOf(rule, { webhooks: [{ ...silent, subscribed: true }, other] })).toEqual([]);
    expect(pickableWebhooks([silent, other], "")).toEqual([other]);
    expect(pickableWebhooks([silent, other], WEBHOOK)).toEqual([silent, other]);
  });

  it("does not call the runner of a colleague's rule missing: the viewer only knows their own runners", () => {
    const rule = stored({ effects: [{ kind: "agent", runtime: "runner", prompt: "Check", runnerId: RUNNER }] });
    const noneOfMine = { ownKey: { available: false, models: [] }, runner: { reason: "noRunner", runners: [] } };

    expect(unavailableOf(rule, { runtimes: noneOfMine, viewerIsOwner: false })).toEqual([]);
    expect(unavailableOf(rule, { runtimes: noneOfMine, viewerIsOwner: true })).toEqual([
      { card: "effects.0", what: "runner" },
    ]);
    expect(unavailableOf(rule, { runtimes: noneOfMine })).toEqual([{ card: "effects.0", what: "runner" }]);
  });

  it("does not call a webhook missing when the member may not see webhooks, nor a model when no key is saved", () => {
    const rule = stored({
      effects: [
        { kind: "callWebhook", webhookId: WEBHOOK },
        { kind: "agent", runtime: "ownKey", prompt: "Check", model: "m-1" },
        { kind: "agent", runtime: "runner", prompt: "Check", runnerId: RUNNER },
      ],
    });

    expect(
      unavailableOf(rule, {
        webhooks: null,
        runtimes: { ownKey: { available: false, models: [] }, runner: { reason: "notConfigured", runners: [] } },
      }),
    ).toEqual([]);
  });

  it("checks the references of kept steps too", () => {
    const rule = stored({
      conditions: [{ fieldId: GONE, operator: "before", value: { kind: "date", value: "2026-12-31" } }],
      effects: [
        {
          kind: "setField",
          fields: [
            { fieldId: STAGE, value: select("won") },
            { fieldId: GONE, value: { kind: "text", value: "x" } },
          ],
        },
        { ...CREATE, typeId: GONE, assignedUserIds: [MEMBER] },
      ],
    });
    const opened = ruleToDraft(rule, MODEL, TZ);

    expect(opened.effects.map((effect) => effect.kind)).toEqual(["kept", "kept"]);
    expect(draftUnavailable(opened, references())).toEqual([
      { card: "conditions.0", what: "field" },
      { card: "effects.0", what: "field" },
      { card: "effects.1", what: "list" },
    ]);
  });
});
