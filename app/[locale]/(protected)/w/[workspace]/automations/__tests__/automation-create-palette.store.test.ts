import type { RecordModelView } from "@/features/records/record-model.schema";
import type { AutomationBuilderContext } from "../components/automation-builder.store";

import { autorun } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { noAgentRuntimes } from "@/features/automation-rules/agent-runtime-availability";

const actions = vi.hoisted(() => ({
  composeAutomationAction: vi.fn(),
  previewAutomationRuleAction: vi.fn(),
  setAutomationRuleEnabledAction: vi.fn(),
  upsertAutomationRuleAction: vi.fn(),
}));

vi.mock("../actions", () => actions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() } }));

import { toAutomationBuilderModel } from "../components/automation-builder-model";
import { AutomationCreatePaletteStore } from "../components/automation-create-palette.store";

const DEALS = "11111111-1111-4111-8111-111111111111";
const NAME = "22222222-2222-4222-8222-111111111111";

const MODEL = toAutomationBuilderModel({
  revision: 1,
  types: [{ id: DEALS, label: "Deal", archived: false, embedded: false, position: 0, primaryFieldId: NAME }],
  fields: [
    {
      id: NAME,
      typeId: DEALS,
      label: "Name",
      valueType: "text",
      behavior: { kind: "input" },
      archived: false,
      required: false,
      options: [],
      position: 0,
    },
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

const DRAFT_REPLY = {
  ok: true,
  data: {
    status: "draft",
    draft: {
      name: "Offer follow-up",
      enabled: true,
      trigger: { kind: "recordCreated", typeId: DEALS },
      conditions: [],
      effects: [],
    },
  },
};

function setup(context: AutomationBuilderContext = CONTEXT) {
  const builder = { openForCreate: vi.fn() };
  const store = new AutomationCreatePaletteStore(builder);
  const onSaved = vi.fn();
  store.open({ context, onSaved, typeId: DEALS });
  return { builder, store, onSaved };
}

describe("AutomationCreatePaletteStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a view that rendered before the first open react to the session it is opened with", () => {
    const store = new AutomationCreatePaletteStore({ openForCreate: vi.fn() });
    const seen: (AutomationBuilderContext | null)[] = [];
    const dispose = autorun(() => {
      seen.push(store.context);
    });

    store.open({ context: CONTEXT, onSaved: vi.fn() });
    dispose();

    expect(seen).toEqual([null, CONTEXT]);
  });

  it("opens empty and hands a blank chain for the chosen list to the builder", () => {
    const { builder, store, onSaved } = setup();
    expect(store.isOpen).toBe(true);
    expect(store.query).toBe("");

    store.openBlank();

    expect(store.isOpen).toBe(false);
    expect(builder.openForCreate).toHaveBeenCalledWith(CONTEXT, onSaved, { typeId: DEALS });
  });

  it("hands a template draft to the builder without marking it as composed", () => {
    const { builder, store, onSaved } = setup();
    const draft = { name: "Recipe" } as never;

    store.openDraft(draft);

    expect(store.isOpen).toBe(false);
    expect(builder.openForCreate).toHaveBeenCalledWith(CONTEXT, onSaved, { typeId: DEALS, draft, composed: false });
  });

  it("composes the typed text and opens the builder with Mate's draft", async () => {
    actions.composeAutomationAction.mockResolvedValue(DRAFT_REPLY);
    const { builder, store } = setup();
    store.setQuery("  When a deal is created, tell me  ");

    expect(await store.compose()).toBe("drafted");

    expect(actions.composeAutomationAction).toHaveBeenCalledWith({ sentence: "When a deal is created, tell me" });
    expect(store.isOpen).toBe(false);
    expect(store.composing).toBe(false);
    const [, , options] = builder.openForCreate.mock.calls[0] as [unknown, unknown, Record<string, unknown>];
    expect(options.composed).toBe(true);
    expect((options.draft as { name: string }).name).toBe("Offer follow-up");
  });

  it("keeps the palette open with the reason when Mate refuses, and clears it once the text changes", async () => {
    actions.composeAutomationAction.mockResolvedValue({ ok: true, data: { status: "refused", reason: "unsupported" } });
    const { builder, store } = setup();

    expect(await store.compose()).toBe("failed");
    expect(actions.composeAutomationAction).not.toHaveBeenCalled();

    store.setQuery("Wait three days, then email them");
    expect(await store.compose()).toBe("refused");
    expect(store.refusal).toBe("unsupported");
    expect(store.isOpen).toBe(true);
    expect(builder.openForCreate).not.toHaveBeenCalled();

    store.setQuery("Wait three days, then remind me");
    expect(store.refusal).toBeNull();
  });

  it("drops a composed draft that arrives after the palette was closed or reopened", async () => {
    let answer: (value: unknown) => void = () => undefined;
    actions.composeAutomationAction.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const { builder, store } = setup();
    store.setQuery("When a deal is created, tell me");
    const pending = store.compose();
    expect(store.composing).toBe(true);

    store.close();
    expect(store.composing).toBe(false);
    answer(DRAFT_REPLY);

    expect(await pending).toBe("stale");
    expect(builder.openForCreate).not.toHaveBeenCalled();
  });

  it("does not compose when the workspace has no composer", async () => {
    const { store } = setup({ ...CONTEXT, composer: false });
    store.setQuery("When a deal is created, tell me");

    expect(await store.compose()).toBe("failed");
    expect(actions.composeAutomationAction).not.toHaveBeenCalled();
  });
});
