import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { AutomationRuleRunDto } from "@/features/automation-rules/automation-rule.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { observer } from "mobx-react-lite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/hooks/use-media-query", () => ({
  useIsWiderThan: () => false,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
vi.mock("@/components/ui/popover", async () => {
  const { createContext, useContext } = await import("react");
  const Open = createContext(false);
  return {
    Popover: ({ open, children }: { open: boolean; children: ReactNode }) => (
      <Open.Provider value={open}>{children}</Open.Provider>
    ),
    PopoverAnchor: ({ children }: { children: ReactNode }) => <>{children}</>,
    PopoverContent: ({ children }: { children: ReactNode }) => (useContext(Open) ? <div>{children}</div> : null),
  };
});
vi.mock("../actions", () => ({
  composeAutomationAction: vi.fn(),
  deleteAutomationRuleAction: vi.fn(),
  previewAutomationRuleAction: vi.fn(() => Promise.resolve({ ok: true, data: null })),
  setAutomationRuleEnabledAction: vi.fn(),
  upsertAutomationRuleAction: vi.fn(),
}));

import { useTranslations } from "next-intl";

import { AutomationCanvas } from "@/components/automations/canvas/automation-canvas";

import { toAutomationBuilderModel } from "../components/automation-builder-model";
import { AutomationBuilderStore } from "../components/automation-builder.store";
import { ruleCanvasView } from "../components/automation-rule-canvas";

const DEALS = "11111111-1111-4111-8111-111111111111";
const NAME = "22222222-2222-4222-8222-111111111111";
const STAGE = "22222222-2222-4222-8222-222222222222";

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
    {
      id: STAGE,
      typeId: DEALS,
      label: "Stage",
      valueType: "select",
      behavior: { kind: "input" },
      archived: false,
      required: false,
      options: [{ id: "won", label: "Won" }],
      position: 1,
    },
  ],
  relationships: [],
} as unknown as RecordModelView);

const RUNTIMES: AgentRuntimeAvailability = {
  mate: { available: true, reason: null, models: [], runners: [] },
  ownKey: { available: false, reason: "noKey", models: [], runners: [] },
  runner: { available: false, reason: "noRunner", models: [], runners: [] },
};

function makeStore({ canManage = true, webhooks = [] as [] | null } = {}) {
  const store = new AutomationBuilderStore({
    registerModalStore: vi.fn(),
    userStore: { user: { id: "u", role: { isSystemRole: false } }, can: vi.fn(() => canManage) },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore);
  act(() => {
    store.openForCreate(
      { model: MODEL, runtimes: RUNTIMES, webhooks, composer: false, cloud: false, timezone: "UTC" },
      vi.fn(),
      { typeId: DEALS },
    );
    store.patchTrigger({ kind: "recordCreated", typeId: DEALS });
  });
  return store;
}

const Harness = observer(function Harness({ store }: { store: AutomationBuilderStore }) {
  const t = useTranslations();
  const view = ruleCanvasView(store, t);
  if (!view) return null;
  return <AutomationCanvas actions={view.actions} steps={view.steps} />;
});

let container: HTMLDivElement;
let root: Root;

function mount(store: AutomationBuilderStore) {
  act(() => root.render(<Harness store={store} />));
}

const stepIds = () =>
  [...container.querySelectorAll<HTMLElement>("[data-automation-step]")].map((node) =>
    node.getAttribute("data-automation-step"),
  );
const add = (index: number) => container.querySelector<HTMLButtonElement>(`[data-automation-add="${index}"]`);
const pick = (kind: string) =>
  act(() => container.querySelector<HTMLButtonElement>(`[data-automation-palette-item="${kind}"]`)?.click());
const step = (id: string) => container.querySelector<HTMLButtonElement>(`[data-automation-step="${id}"]`);
const tool = (id: string, action: string) =>
  container.querySelector<HTMLButtonElement>(
    `[data-automation-step-toolbar="${id}"] [data-automation-step-action="${action}"]`,
  );

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the automation canvas", () => {
  it("inserts the picked step exactly at the + it was opened from and selects it", () => {
    const store = makeStore();
    act(() => {
      store.addEffect("notify", 0);
      store.addEffect("agent", 1);
      store.select(null);
    });
    mount(store);
    expect(stepIds()).toEqual(["trigger", "effect-0", "effect-1"]);

    act(() => add(2)?.click());
    expect(container.querySelector("[data-automation-palette]")).not.toBeNull();
    pick("setField");

    expect(store.form.effects.map((effect) => effect.kind)).toEqual(["notify", "setField", "agent"]);
    expect(store.expanded).toBe("effect-1");
    expect(step("effect-1")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-automation-palette]")).toBeNull();
  });

  it("keeps a condition with the conditions when it is added between two actions", () => {
    const store = makeStore();
    act(() => {
      store.addEffect("notify", 0);
      store.addEffect("agent", 1);
    });
    mount(store);

    act(() => add(2)?.click());
    pick("condition");

    expect(store.form.conditions).toHaveLength(1);
    expect(stepIds()).toEqual(["trigger", "condition-0", "effect-0", "effect-1"]);
    expect(store.expanded).toBe("condition-0");
  });

  it("appends from the dashed Add step node at the end", () => {
    const store = makeStore();
    act(() => store.addEffect("agent", 0));
    mount(store);

    const node = add(2);
    expect(node?.textContent).toBe("Automations.canvas.addStep");
    act(() => node?.click());
    pick("notify");

    expect(store.form.effects.map((effect) => effect.kind)).toEqual(["agent", "notify"]);
    expect(store.expanded).toBe("effect-1");
  });

  it("moves, duplicates and removes the selected step from its toolbar, and never the trigger", () => {
    const store = makeStore();
    act(() => {
      store.addEffect("notify", 0);
      store.addEffect("agent", 1);
      store.select(null);
    });
    mount(store);

    act(() => step("trigger")?.click());
    expect(store.expanded).toBe("trigger");
    expect(container.querySelector("[data-automation-step-toolbar]")).toBeNull();

    act(() => step("effect-0")?.click());
    expect(tool("effect-0", "up")?.disabled).toBe(true);
    act(() => tool("effect-0", "down")?.click());
    expect(store.form.effects.map((effect) => effect.kind)).toEqual(["agent", "notify"]);
    expect(store.expanded).toBe("effect-1");
    expect(tool("effect-1", "down")?.disabled).toBe(true);

    act(() => tool("effect-1", "duplicate")?.click());
    expect(store.form.effects.map((effect) => effect.kind)).toEqual(["agent", "notify", "notify"]);
    expect(store.expanded).toBe("effect-2");

    act(() => tool("effect-2", "remove")?.click());
    expect(store.form.effects.map((effect) => effect.kind)).toEqual(["agent", "notify"]);
    expect(store.expanded).toBeNull();
  });

  it("switches Call a webhook off, with the reason, for a member who cannot see webhooks", () => {
    const store = makeStore({ webhooks: null });
    act(() => store.addEffect("notify", 0));
    mount(store);

    act(() => add(2)?.click());
    const item = container.querySelector<HTMLButtonElement>('[data-automation-palette-item="callWebhook"]');
    expect(item?.disabled).toBe(true);
    expect(item?.querySelector("[data-automation-palette-reason]")?.textContent).toBe(
      "Automations.palette.callWebhook.restricted",
    );
  });

  it("shows someone else's automation without any + or toolbar", () => {
    const store = makeStore();
    act(() => store.addEffect("notify", 0));
    store.rootStore.userStore.can = vi.fn(() => false);
    mount(store);

    expect(store.isReadOnly).toBe(true);
    expect(container.querySelector("[data-automation-add]")).toBeNull();
    act(() => step("effect-0")?.click());
    expect(store.expanded).toBe("effect-0");
    expect(container.querySelector("[data-automation-step-toolbar]")).toBeNull();
  });

  it("starts a blank automation with the default trigger counted and the common next steps offered", () => {
    const store = new AutomationBuilderStore({
      registerModalStore: vi.fn(),
      userStore: { user: { id: "u", role: { isSystemRole: false } }, can: vi.fn(() => true) },
      localeStore: { getTranslation: (key: string) => key },
    } as unknown as RootStore);
    act(() =>
      store.openForCreate(
        { model: MODEL, runtimes: RUNTIMES, webhooks: [], composer: false, cloud: false, timezone: "UTC" },
        vi.fn(),
        {},
      ),
    );
    mount(store);

    expect(stepIds()).toEqual(["trigger"]);
    expect(store.expanded).toBe("trigger");
    expect(add(1)).not.toBeNull();
    const quick = [...container.querySelectorAll<HTMLElement>("[data-automation-quick-step]")].map(
      (item) => item.dataset.automationQuickStep,
    );
    expect(quick).toEqual(["agent", "condition", "setField", "createRecord", "notify"]);

    act(() => container.querySelector<HTMLElement>('[data-automation-quick-step="notify"]')?.click());
    expect(stepIds()).toEqual(["trigger", "effect-0"]);
    expect(store.expanded).toBe("effect-0");
    expect(container.querySelector("[data-automation-quick-steps]")).toBeNull();
    expect(add(2)).not.toBeNull();
  });

  it("marks each step of a replayed run and locks editing until Back to editing", () => {
    const store = makeStore();
    act(() => {
      store.addEffect("notify", 0);
      store.addEffect("agent", 1);
    });
    const run = {
      id: "run-1",
      status: "failed",
      effects: [
        { kind: "notify", status: "applied" },
        { kind: "agent", status: "failed", detail: "agentRuntimeUnavailable" },
      ],
      reason: null,
      error: "effectFailed",
      createdAt: new Date().toISOString(),
    } as unknown as AutomationRuleRunDto;
    act(() => store.showRun(run));
    mount(store);

    const mark = (id: string) =>
      step(id)?.parentElement?.querySelector("[data-automation-step-mark]")?.getAttribute("data-automation-step-mark");
    expect(mark("trigger")).toBe("ok");
    expect(mark("effect-0")).toBe("ok");
    expect(mark("effect-1")).toBe("failed");
    expect(container.querySelector("[data-automation-add]")).toBeNull();

    act(() => store.closeRun());
    expect(mark("effect-1")).toBeUndefined();
    expect(add(1)).not.toBeNull();
  });
});
