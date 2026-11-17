import type { RootStore } from "@/core/stores/root.store";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { AutomationBuilderContext } from "../components/automation-builder.store";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { noAgentRuntimes } from "@/features/automation-rules/agent-runtime-availability";

const actions = vi.hoisted(() => ({
  composeAutomationAction: vi.fn(),
  previewAutomationRuleAction: vi.fn(),
  upsertAutomationRuleAction: vi.fn(),
}));

vi.mock("../actions", () => actions);

const sonner = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }));

vi.mock("sonner", () => sonner);

import { toAutomationBuilderModel } from "../components/automation-builder-model";
import { blankAgentEffect } from "../components/automation-draft";
import { AutomationBuilderStore, AUTOMATION_PREVIEW_DELAY_MS } from "../components/automation-builder.store";

const DEALS = "11111111-1111-4111-8111-111111111111";
const TASKS = "11111111-1111-4111-8111-222222222222";
const NAME = "22222222-2222-4222-8222-111111111111";
const STAGE = "22222222-2222-4222-8222-222222222222";
const CLOSE = "22222222-2222-4222-8222-444444444444";
const TITLE = "22222222-2222-4222-8222-666666666666";
const RULE = "00000000-0000-4000-8000-0000000000a1";
const WEBHOOK = "66666666-6666-4666-8666-666666666666";
const OTHER_WEBHOOK = "66666666-6666-4666-8666-777777777777";

function field(id: string, typeId: string, valueType: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    typeId,
    label: `field ${id.slice(-3)}`,
    valueType,
    behavior: { kind: "input" },
    archived: false,
    required: false,
    options: [],
    position: 0,
    ...extra,
  };
}

const MODEL = toAutomationBuilderModel({
  revision: 1,
  types: [
    { id: DEALS, label: "Deal", archived: false, embedded: false, position: 0, primaryFieldId: NAME },
    { id: TASKS, label: "Action", archived: false, embedded: false, position: 1, primaryFieldId: TITLE },
  ],
  fields: [
    field(NAME, DEALS, "text"),
    field(STAGE, DEALS, "select", { options: [{ id: "won", label: "Won" }] }),
    field(CLOSE, DEALS, "date"),
    field(TITLE, TASKS, "text"),
  ],
  relationships: [],
} as unknown as RecordModelView);

const CONTEXT: AutomationBuilderContext = {
  model: MODEL,
  runtimes: noAgentRuntimes(),
  webhooks: [],
  composer: true,
  cloud: true,
  timezone: "Europe/Berlin",
};

const SAVED = {
  id: RULE,
  ownerUserId: null,
  owner: null,
  name: "Saved",
  enabled: true,
  trigger: { kind: "recordCreated", typeId: DEALS },
  conditions: [],
  effects: [],
  disabledReason: null,
  lastRunAt: null,
  lastRunStatus: null,
  createdAt: "2026-11-16T00:00:00.000Z",
  updatedAt: "2026-11-16T00:00:00.000Z",
};

function makeStore() {
  return new AutomationBuilderStore({
    registerModalStore: vi.fn(),
    userStore: { user: { id: "u", role: { isSystemRole: false } }, can: vi.fn(() => true) },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore);
}

function open(options: Parameters<AutomationBuilderStore["openForCreate"]>[2] = {}) {
  const store = makeStore();
  const onSaved = vi.fn();
  store.openForCreate(CONTEXT, onSaved, { typeId: DEALS, ...options });
  return { store, onSaved };
}

describe("AutomationBuilderStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    actions.previewAutomationRuleAction.mockResolvedValue({
      ok: true,
      data: { supported: true, total: 3, recordIds: [], alreadyFired: 0 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a new automation on the start screen with an empty chain and nothing to discard", () => {
    const { store } = open();

    expect(store.isOpen).toBe(true);
    expect(store.screen).toBe("start");
    expect(store.form.effects).toEqual([]);
    expect(store.isExisting).toBe(false);
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("moves to the chain once a draft is applied and then guards unsaved changes", () => {
    const { store } = open();

    store.startFromScratch();
    expect(store.screen).toBe("chain");
    expect(store.hasUnsavedChanges).toBe(false);

    store.setName("Follow up");
    expect(store.hasUnsavedChanges).toBe(true);
  });

  it("opens a saved rule on the chain, on the tab asked for", () => {
    const store = makeStore();
    store.openForRule(CONTEXT, { ...SAVED, effects: [] } as never, vi.fn(), { pane: "runs" });

    expect(store.screen).toBe("chain");
    expect(store.pane).toBe("runs");
    expect(store.isExisting).toBe(true);
    expect(store.form.id).toBe(RULE);
  });

  it("forgets the rule it showed before when a new automation is opened in the same session", () => {
    const store = makeStore();
    store.openForRule(CONTEXT, { ...SAVED, effects: [] } as never, vi.fn());
    expect(store.form.id).toBe(RULE);

    store.openForCreate(CONTEXT, vi.fn(), { typeId: DEALS });
    expect(store.isExisting).toBe(false);
    expect(store.form.id).toBeUndefined();
    expect(store.rule).toBeNull();

    store.openForRule(CONTEXT, { ...SAVED, effects: [] } as never, vi.fn());
    store.openForCreate(CONTEXT, vi.fn(), {
      draft: { name: "Reminder", enabled: true, trigger: store.form.trigger, conditions: [], effects: [] },
    });
    expect(store.screen).toBe("chain");
    expect(store.isExisting).toBe(false);
    expect(store.form.id).toBeUndefined();
    expect(store.form.name).toBe("Reminder");
  });

  it("adds steps from the palette at the position asked for and opens the new card", () => {
    const { store } = open();
    store.startFromScratch();

    store.openPalette({ index: 0 });
    expect(store.palette).toEqual({ index: 0 });
    store.addEffect("notify", 0);
    store.addEffect("agent", 1);

    expect(store.form.effects.map((effect) => effect.kind)).toEqual(["notify", "agent"]);
    expect(store.expanded).toBe("effect-1");
    expect(store.palette).toBeNull();

    store.addCondition(0);
    expect(store.form.conditions).toHaveLength(1);
    expect(store.expanded).toBe("condition-0");

    store.removeEffect(0);
    expect(store.form.effects.map((effect) => effect.kind)).toEqual(["agent"]);
  });

  it("refuses to save an incomplete chain, names what is missing and opens that card", async () => {
    const { store, onSaved } = open();
    store.startFromScratch();
    store.setName("Needs a step");

    expect(await store.save()).toBe("incomplete");
    expect(store.isFlagged("effects")).toBe(true);
    expect(actions.upsertAutomationRuleAction).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();

    store.addEffect("agent", 0);
    expect(await store.save()).toBe("incomplete");
    expect(store.isFlagged("effects.0")).toBe(true);
    expect(store.expanded).toBe("effect-0");
  });

  it("keeps a red mark on the card it was given to when cards are removed or added", async () => {
    const { store } = open();
    store.startFromScratch();
    store.setName("Flags");
    store.addEffect("notify", 0);
    store.addEffect("agent", 0);
    store.addCondition(0);
    store.addCondition(1);
    store.patchCondition(0, { operator: "notEmpty" });

    expect(await store.save()).toBe("incomplete");
    expect(store.invalid).toEqual(["conditions.1", "effects.0"]);

    store.removeEffect(0);
    expect(store.isFlagged("effects.0")).toBe(false);
    expect(store.form.effects.map((effect) => effect.kind)).toEqual(["notify"]);

    store.removeCondition(0);
    expect(store.invalid).toEqual(["conditions.0"]);

    store.addCondition(0);
    expect(store.invalid).toEqual(["conditions.1"]);
    store.removeCondition(1);
    expect(store.invalid).toEqual([]);
  });

  it("moves a red mark along with its step when another step is put in front of it", async () => {
    const { store } = open();
    store.startFromScratch();
    store.setName("Flags");

    expect(await store.save()).toBe("incomplete");
    expect(store.isFlagged("effects")).toBe(true);

    store.addEffect("agent", 0);
    expect(store.isFlagged("effects")).toBe(false);
    expect(await store.save()).toBe("incomplete");
    expect(store.invalid).toEqual(["effects.0"]);

    store.addEffect("notify", 0);
    expect(store.invalid).toEqual(["effects.1"]);
    expect(store.isFlagged("effects.0")).toBe(false);
  });

  it("saves a complete chain, hands the rule back and closes", async () => {
    actions.upsertAutomationRuleAction.mockResolvedValue({ ok: true, data: SAVED });
    const { store, onSaved } = open();
    store.startFromScratch();
    store.patchTrigger({ kind: "recordCreated" });
    store.setName("Ask on creation");
    store.addEffect("agent", 0);
    store.setEffect(0, { ...blankAgentEffect("mate"), prompt: "Draft a reply to {{record.name}}" });

    expect(await store.save()).toBe("saved");

    expect(actions.upsertAutomationRuleAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Ask on creation",
        enabled: true,
        trigger: expect.objectContaining({ kind: "recordCreated", typeId: DEALS }),
        effects: [{ kind: "agent", runtime: "mate", prompt: "Draft a reply to {{record.name}}" }],
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(SAVED);
    expect(store.isOpen).toBe(false);
  });

  it("stays open and reports the failure when the server refuses the rule", async () => {
    actions.upsertAutomationRuleAction.mockResolvedValue({ ok: false, error: { errors: [], properties: {} } });
    const { store, onSaved } = open();
    store.startFromScratch();
    store.setName("Refused");
    store.addEffect("notify", 0);

    expect(await store.save()).toBe("failed");
    expect(store.isOpen).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    expect(store.isLoading).toBe(false);
  });

  it("refuses to save a step whose webhook is gone, opens that card and leaves the rule untouched", async () => {
    const rule = { ...SAVED, effects: [{ kind: "callWebhook", webhookId: WEBHOOK }] };
    const store = makeStore();
    store.openForRule({ ...CONTEXT, webhooks: [{ id: OTHER_WEBHOOK, label: "Other" }] }, rule as never, vi.fn());

    expect(store.unavailable).toEqual([{ card: "effects.0", what: "webhook" }]);
    expect(store.unavailableAt("effects.0")).toBe("webhook");
    expect(await store.save()).toBe("unavailable");
    expect(store.isFlagged("effects.0")).toBe(true);
    expect(store.expanded).toBe("effect-0");
    expect(actions.upsertAutomationRuleAction).not.toHaveBeenCalled();

    store.setEffect(0, { kind: "callWebhook", webhookId: OTHER_WEBHOOK });
    expect(store.unavailable).toEqual([]);
  });

  it("keeps a webhook step as it is for a member who may not see webhooks", async () => {
    actions.upsertAutomationRuleAction.mockResolvedValue({ ok: true, data: SAVED });
    const rule = { ...SAVED, effects: [{ kind: "callWebhook", webhookId: WEBHOOK }] };
    const store = makeStore();
    store.openForRule({ ...CONTEXT, webhooks: null }, rule as never, vi.fn());
    store.setName("Renamed");

    expect(store.unavailable).toEqual([]);
    expect(await store.save()).toBe("saved");
    expect(actions.upsertAutomationRuleAction).toHaveBeenCalledWith(
      expect.objectContaining({ effects: [{ kind: "callWebhook", webhookId: WEBHOOK }] }),
    );
  });

  it("starts a new condition with a comparison its field can be saved with", () => {
    const { store } = open();
    store.startFromScratch();

    store.addCondition(0);

    expect(store.form.conditions).toEqual([{ fieldId: NAME, operator: "equals", value: "", values: [], kept: null }]);
  });

  it("previews a date reminder once the trigger is complete, after a short delay", async () => {
    const { store } = open();
    store.startFromScratch();
    store.patchTrigger({ kind: "dateReached", fieldId: "" });
    await vi.advanceTimersByTimeAsync(AUTOMATION_PREVIEW_DELAY_MS);
    expect(actions.previewAutomationRuleAction).not.toHaveBeenCalled();
    expect(store.preview).toBeNull();

    store.patchTrigger({ kind: "dateReached", fieldId: CLOSE, days: "2", direction: "before" });
    expect(actions.previewAutomationRuleAction).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AUTOMATION_PREVIEW_DELAY_MS);

    expect(actions.previewAutomationRuleAction).toHaveBeenCalledWith({
      rule: {
        trigger: expect.objectContaining({ kind: "dateReached", typeId: DEALS, fieldId: CLOSE, days: 2 }),
        conditions: [],
      },
    });
    expect(store.preview).toEqual({ supported: true, total: 3, recordIds: [], alreadyFired: 0 });
  });

  it("keeps the last answer for the latest edit when previews overlap", async () => {
    const { store } = open();
    store.startFromScratch();
    let release: (value: unknown) => void = () => undefined;
    actions.previewAutomationRuleAction
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockResolvedValueOnce({ ok: true, data: { supported: true, total: 9, recordIds: [], alreadyFired: 0 } });

    store.patchTrigger({ kind: "dateReached", fieldId: CLOSE, days: "1" });
    await vi.advanceTimersByTimeAsync(AUTOMATION_PREVIEW_DELAY_MS);
    store.patchTrigger({ days: "3" });
    await vi.advanceTimersByTimeAsync(AUTOMATION_PREVIEW_DELAY_MS);
    release({ ok: true, data: { supported: true, total: 1, recordIds: [], alreadyFired: 0 } });
    await vi.advanceTimersByTimeAsync(0);

    expect(store.preview?.total).toBe(9);
  });

  it("turns a composed sentence into a draft that waits for the user to switch it on", async () => {
    actions.composeAutomationAction.mockResolvedValue({
      ok: true,
      data: {
        status: "draft",
        draft: {
          name: "Offer follow-up",
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
        },
      },
    });
    const { store } = open();
    store.setComposerText("When a deal is created, tell me");

    expect(await store.compose()).toBe("drafted");

    expect(actions.composeAutomationAction).toHaveBeenCalledWith({ sentence: "When a deal is created, tell me" });
    expect(store.screen).toBe("chain");
    expect(store.composedByMate).toBe(true);
    expect(store.form.name).toBe("Offer follow-up");
    expect(store.form.effects.map((effect) => effect.kind)).toEqual(["notify"]);
    expect(actions.upsertAutomationRuleAction).not.toHaveBeenCalled();
  });

  it("drops a composed draft that arrives after the builder moved on to another rule", async () => {
    let answer: (value: unknown) => void = () => undefined;
    actions.composeAutomationAction.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const { store } = open();
    store.setComposerText("When a deal is created, tell me");
    const pending = store.compose();
    expect(store.composing).toBe(true);

    store.close();
    store.openForRule(CONTEXT, { ...SAVED, name: "Rule B" } as never, vi.fn());
    expect(store.composing).toBe(false);
    answer({
      ok: true,
      data: {
        status: "draft",
        draft: { name: "Composed", enabled: true, trigger: { kind: "recordCreated", typeId: DEALS }, effects: [] },
      },
    });

    expect(await pending).toBe("stale");
    expect(store.form.id).toBe(RULE);
    expect(store.form.name).toBe("Rule B");
    expect(store.composedByMate).toBe(false);
    expect(store.composing).toBe(false);
  });

  it("drops a composed draft once the user picked a recipe or started from scratch instead", async () => {
    let answer: (value: unknown) => void = () => undefined;
    actions.composeAutomationAction.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const { store } = open();
    store.setComposerText("Tell me about new deals");
    const pending = store.compose();

    store.startFromScratch();
    store.setName("My own chain");
    answer({ ok: true, data: { status: "refused", reason: "unsupported" } });

    expect(await pending).toBe("stale");
    expect(store.form.name).toBe("My own chain");
    expect(store.composerRefusal).toBeNull();
    expect(store.composing).toBe(false);
  });

  it("shows the reason when Mate refuses and ignores an empty sentence", async () => {
    actions.composeAutomationAction.mockResolvedValue({ ok: true, data: { status: "refused", reason: "unsupported" } });
    const { store } = open();

    expect(await store.compose()).toBe("failed");
    expect(actions.composeAutomationAction).not.toHaveBeenCalled();

    store.setComposerText("Wait three days, then email them");
    expect(await store.compose()).toBe("refused");
    expect(store.composerRefusal).toBe("unsupported");
    expect(store.screen).toBe("start");
    expect(store.composing).toBe(false);
  });
});
