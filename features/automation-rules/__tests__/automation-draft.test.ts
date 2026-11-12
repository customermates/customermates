import { describe, expect, it } from "vitest";

import type { RecordModelView } from "@/features/records/record-model.schema";
import type { AutomationBuilderModel } from "../automation-builder-model";
import type { AutomationDraft } from "../automation-draft";
import type { AutomationRuleDto } from "../automation-rule.schema";

import { toAutomationBuilderModel } from "../automation-builder-model";
import { draftToUpsert, emptyDraft, reminderDraft, ruleToDraft, scalarFor } from "../automation-draft";
import { automationModelIssues } from "../automation-model-validation";
import { UpsertAutomationRuleSchema } from "../automation-rule.schema";

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
    field(TAGS, DEALS, "select", { multiple: true, options: [{ id: "vip", label: "VIP" }] }),
    field(FORMULA, DEALS, "number", {}, "formula"),
    field("22222222-2222-4222-8222-aaaaaaaaaaaa", DEALS, "file"),
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
      conditions: [{ fieldId: STAGE, operator: "equals", value: "" }],
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
    });
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
          { fieldId: STAGE, operator: "notEquals", value: "lost" },
          { fieldId: TAGS, operator: "equals", value: "vip" },
          { fieldId: AMOUNT, operator: "notEmpty", value: "" },
          { fieldId: CLOSE, operator: "before", value: "" },
          { fieldId: CLOSE, operator: "after", value: "3" },
        ],
      }),
    );
    expect(input.conditions).toEqual([
      { fieldId: STAGE, operator: "notEquals", value: { kind: "select", value: "lost" } },
      { fieldId: TAGS, operator: "in", values: [{ kind: "select", value: "vip" }] },
      { fieldId: AMOUNT, operator: "notEmpty" },
      { fieldId: CLOSE, operator: "before", relativeDays: 0 },
      { fieldId: CLOSE, operator: "after", relativeDays: 3 },
    ]);
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

  it("refuses a calculated field as a target and record effects on a message rule", () => {
    expect(draftToUpsert(draft({ effects: [{ kind: "setField", fieldId: FORMULA, value: "1" }] }), MODEL).ok).toBe(
      false,
    );
    const message = draft({ trigger: { ...draft().trigger, kind: "messageReceived" } });
    expect(draftToUpsert({ ...message, effects: [{ kind: "setField", fieldId: STAGE, value: "won" }] }, MODEL).ok).toBe(
      false,
    );
    const notifyOwner = convert(message);
    expect(notifyOwner.trigger).toEqual({ kind: "messageReceived", channel: "any" });
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

  it("round-trips through the builder without losing anything, even what it cannot edit", () => {
    const opened = ruleToDraft(rule, MODEL, TZ);
    expect(opened.effects.at(-1)).toEqual({ kind: "kept", effect: rule.effects[2] });
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
    const form = { ...rule, trigger: { kind: "formSubmitted" as const, typeId: DEALS }, conditions: [] };
    const opened = ruleToDraft(form, MODEL, TZ);
    expect(opened.trigger.kind).toBe("other");
    const saved = convert({ ...opened, name: "Renamed" });
    expect(saved.trigger).toEqual({ kind: "formSubmitted", typeId: DEALS });
    expect(saved.name).toBe("Renamed");
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
