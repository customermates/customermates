import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { DraftAgent } from "../components/automation-draft";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string; kind?: string }) =>
    values?.name ? `${key}:${values.name}` : values?.kind ? `${key}:${values.kind}` : key,
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
vi.mock("../actions", () => ({
  composeAutomationAction: vi.fn(),
  previewAutomationRuleAction: vi.fn(() => Promise.resolve({ ok: true, data: null })),
  setAutomationRuleEnabledAction: vi.fn(),
  upsertAutomationRuleAction: vi.fn(),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: { children: ReactNode; value: string }) => <div data-select={value}>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <li data-value={value}>{children}</li>,
}));

import { Zap } from "lucide-react";

import { AutomationCard, AutomationConnector } from "@/components/automations/automation-card";
import { UpsertAutomationRuleSchema } from "@/features/automation-rules/automation-rule.schema";
import { AutomationPalette } from "@/components/automations/automation-palette";

import { AGENT_SETTINGS_HREF, AutomationAgentFields } from "../components/automation-agent-fields";
import { toAutomationBuilderModel } from "../components/automation-builder-model";
import { AutomationBuilderStore } from "../components/automation-builder.store";
import { AutomationCardChain } from "../components/automation-card-chain";
import { AutomationConditionFields } from "../components/automation-condition-fields";
import { blankAgentEffect, blankCondition, emptyDraft } from "../components/automation-draft";
import { AutomationEffectFields } from "../components/automation-effect-fields";
import { AutomationTriggerEditor } from "../components/automation-trigger-editor";

const RUNNER = "88888888-8888-4888-8888-888888888888";
const DEALS = "11111111-1111-4111-8111-111111111111";
const NAME = "22222222-2222-4222-8222-111111111111";
const STAGE = "22222222-2222-4222-8222-222222222222";
const OWNER = "22222222-2222-4222-8222-333333333333";
const MEETING = "22222222-2222-4222-8222-444444444444";

function field(id: string, valueType: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    typeId: DEALS,
    label: `field ${valueType}`,
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
  types: [{ id: DEALS, label: "Deal", archived: false, embedded: false, position: 0, primaryFieldId: NAME }],
  fields: [
    field(NAME, "text"),
    field(STAGE, "select", {
      options: [
        { id: "won", label: "Won" },
        { id: "lost", label: "Lost" },
      ],
    }),
    field(OWNER, "member"),
    field(MEETING, "dateTime"),
  ],
  relationships: [],
} as unknown as RecordModelView);

const TRIGGER = emptyDraft(MODEL, { typeId: DEALS, timezone: "UTC" }).trigger;

const AVAILABLE = { available: true, reason: null, models: [], runners: [] };
const UNAVAILABLE = (reason: "selfHosted" | "plan" | "noKey" | "noRunner" | "notConfigured") => ({
  available: false,
  reason,
  models: [],
  runners: [],
});

function runtimes(overrides: Partial<AgentRuntimeAvailability> = {}): AgentRuntimeAvailability {
  return {
    mate: UNAVAILABLE("selfHosted"),
    ownKey: UNAVAILABLE("noKey"),
    runner: UNAVAILABLE("noRunner"),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function render(effect: DraftAgent, availability: AgentRuntimeAvailability, onChange = vi.fn(), flagged = false) {
  act(() =>
    root.render(
      <AutomationAgentFields effect={effect} flagged={flagged} runtimes={availability} onChange={onChange} />,
    ),
  );
  return onChange;
}

function mount(node: ReactNode) {
  act(() => root.render(node));
}

function checkboxes() {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')];
}

function offered(selectValue: string) {
  const select = container.querySelector(`[data-select="${selectValue}"]`);
  return [...(select?.querySelectorAll("li") ?? [])].map((item) => item.getAttribute("data-value"));
}

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

describe("the Ask an agent card", () => {
  it("names why the chosen runtime is unavailable and links to Settings, Connections, Agents", () => {
    render(blankAgentEffect("ownKey"), runtimes());

    const reason = container.querySelector("[data-agent-reason]");
    expect(reason?.getAttribute("data-agent-reason")).toBe("noKey");
    expect(reason?.textContent).toContain("Automations.agent.reason.noKey");
    expect(reason?.querySelector("a")?.getAttribute("href")).toBe(AGENT_SETTINGS_HREF);
    expect(AGENT_SETTINGS_HREF).toBe("/settings/connections?tab=agents");
  });

  it("says who can set a runtime up, without a link, to a member who cannot open that settings tab", () => {
    mount(
      <AutomationAgentFields
        canOpenSettings={false}
        effect={blankAgentEffect("ownKey")}
        flagged={false}
        runtimes={runtimes()}
        onChange={vi.fn()}
      />,
    );

    const reason = container.querySelector("[data-agent-reason]");
    expect(reason?.querySelector("a")).toBeNull();
    expect(reason?.querySelector("[data-agent-settings-ask]")?.textContent).toBe("Automations.agent.askAdmin");
    expect(reason?.textContent).toContain("Automations.agent.reason.noKey");
  });

  it("shows the reason of every unavailable runtime in turn, and none for an available one", () => {
    const reasons = {
      mate: "selfHosted",
      ownKey: "noKey",
      runner: "noRunner",
    } as const;
    for (const runtime of ["mate", "ownKey", "runner"] as const) {
      render(blankAgentEffect(runtime), runtimes());
      expect(container.querySelector("[data-agent-reason]")?.getAttribute("data-agent-reason")).toBe(reasons[runtime]);
    }

    render(blankAgentEffect("mate"), runtimes({ mate: AVAILABLE }));
    expect(container.querySelector("[data-agent-reason]")).toBeNull();
  });

  it("says 'runner of the owner' on a colleague's runner step instead of the viewer's own runners", () => {
    const effect = { ...blankAgentEffect("runner"), runnerId: RUNNER };
    const mine = {
      ...AVAILABLE,
      runners: [{ id: "99999999-9999-4999-8999-999999999999", name: "Mine", online: true }],
    };
    const show = (ownRule: boolean, availability: AgentRuntimeAvailability) =>
      mount(
        <AutomationAgentFields
          effect={effect}
          flagged={false}
          ownRule={ownRule}
          runtimes={availability}
          onChange={vi.fn()}
        />,
      );

    show(false, runtimes());
    expect(container.querySelector("[data-agent-owner-runner]")?.textContent).toBe("Automations.agent.ownerRunner");
    expect(container.querySelector("[data-agent-reason]")).toBeNull();
    expect(container.querySelector("[data-select]")).toBeNull();

    show(false, runtimes({ runner: mine }));
    expect(container.querySelector("[data-select]")).toBeNull();

    show(true, runtimes());
    expect(container.querySelector("[data-agent-owner-runner]")).toBeNull();
    expect(container.querySelector("[data-agent-reason]")?.getAttribute("data-agent-reason")).toBe("noRunner");
    expect(offered(RUNNER)).toEqual(["default"]);
  });

  it("offers the three runtimes as radios and switches runtime without keeping a stale model or runner", () => {
    const effect = { ...blankAgentEffect("ownKey"), model: "m-1", runnerId: RUNNER, prompt: "Draft" };
    const onChange = render(
      effect,
      runtimes({ ownKey: { ...AVAILABLE, models: [{ id: "m-1", label: "Model one" }] } }),
    );

    const radios = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.map((radio) => radio.getAttribute("data-agent-runtime"))).toEqual(["mate", "ownKey", "runner"]);
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);

    act(() => radios[2]?.click());
    expect(onChange).toHaveBeenCalledWith({ ...effect, runtime: "runner", model: "", runnerId: "" });
  });

  it("lists the models of an own key and the runners of a runner, with an offline note", () => {
    render(
      { ...blankAgentEffect("ownKey"), model: "m-1" },
      runtimes({
        ownKey: {
          ...AVAILABLE,
          models: [
            { id: "m-1", label: "Model one" },
            { id: "m-2", label: "Model two" },
          ],
        },
      }),
    );
    expect([...container.querySelectorAll("[data-value]")].map((option) => option.getAttribute("data-value"))).toEqual([
      "default",
      "m-1",
      "m-2",
    ]);
    expect(container.querySelector("[data-select]")?.getAttribute("data-select")).toBe("m-1");

    render(
      blankAgentEffect("runner"),
      runtimes({ runner: { ...AVAILABLE, runners: [{ id: RUNNER, name: "Office", online: false }] } }),
    );
    expect(container.textContent).toContain("Automations.agent.runnerOffline:Office");
  });

  it("offers the default model of the key only when the workspace has one key", () => {
    const models = [
      { id: "m-1", label: "Model one" },
      { id: "m-2", label: "Model two" },
    ];
    const values = () =>
      [...container.querySelectorAll("[data-value]")].map((option) => option.getAttribute("data-value"));

    render(blankAgentEffect("ownKey"), runtimes({ ownKey: { ...AVAILABLE, models, defaultModel: null } }));
    expect(values()).toEqual(["m-1", "m-2"]);
    expect(container.querySelector("[data-select]")?.getAttribute("data-select")).toBe("");

    render(blankAgentEffect("ownKey"), runtimes({ ownKey: { ...AVAILABLE, models, defaultModel: "m-1" } }));
    expect(values()).toEqual(["default", "m-1", "m-2"]);
    expect(container.querySelector("[data-select]")?.getAttribute("data-select")).toBe("default");
  });

  it("keeps the prompt in the effect and bounds its length", () => {
    const effect = blankAgentEffect("mate");
    const onChange = render(effect, runtimes({ mate: AVAILABLE }));
    const prompt = container.querySelector("textarea");

    expect(prompt?.getAttribute("maxlength")).toBe("4000");
    expect(prompt?.getAttribute("aria-invalid")).toBeNull();

    render(effect, runtimes({ mate: AVAILABLE }), onChange, true);
    expect(container.querySelector("textarea")?.getAttribute("aria-invalid")).toBe("true");
  });

  it("names the prompt field for assistive technology", () => {
    render(blankAgentEffect("mate"), runtimes({ mate: AVAILABLE }));

    const prompt = container.querySelector("textarea");
    const label = container.querySelector(`label[for="${prompt?.id}"]`);
    expect(prompt?.id).toBeTruthy();
    expect(label?.textContent).toBe("Automations.agent.prompt");
  });

  it("moves between the runtimes with the arrow keys and keeps one of them in the tab order", () => {
    const effect = blankAgentEffect("mate");
    const onChange = render(effect, runtimes());
    const radio = (runtime: string) => container.querySelector<HTMLButtonElement>(`[data-agent-runtime="${runtime}"]`);
    const press = (runtime: string, key: string) =>
      act(() => {
        radio(runtime)?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });

    expect(["mate", "ownKey", "runner"].map((runtime) => radio(runtime)?.tabIndex)).toEqual([0, -1, -1]);

    press("mate", "ArrowRight");
    expect(onChange).toHaveBeenLastCalledWith({ ...effect, runtime: "ownKey" });
    expect(document.activeElement).toBe(radio("ownKey"));

    press("mate", "ArrowLeft");
    expect(onChange).toHaveBeenLastCalledWith({ ...effect, runtime: "runner" });

    press("mate", "ArrowDown");
    expect(onChange).toHaveBeenLastCalledWith({ ...effect, runtime: "ownKey" });

    onChange.mockClear();
    press("mate", "a");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still shows the picker for a model or runner that is gone, so another one can be chosen", () => {
    render({ ...blankAgentEffect("runner"), runnerId: RUNNER }, runtimes());
    expect(offered(RUNNER)).toEqual(["default"]);

    render({ ...blankAgentEffect("ownKey"), model: "m-old" }, runtimes());
    expect(offered("m-old")).toEqual(["default"]);
  });
});

describe("a condition card", () => {
  it("shows a condition set outside the builder read-only, with a note and nothing to change", () => {
    const kept = {
      fieldId: MEETING,
      operator: "before" as const,
      value: { kind: "date" as const, value: "2026-12-31" },
    };
    mount(
      <AutomationConditionFields
        condition={{ ...blankCondition(MEETING, "before"), kept }}
        flagged={false}
        model={MODEL}
        typeId={DEALS}
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-automation-kept="condition"]')?.textContent).toBe(
      "AutomationRules.builder.keptCondition",
    );
    expect(container.querySelectorAll("[data-select], input, button")).toHaveLength(0);
  });

  it("edits several values of a choice and lets a value that is gone be removed", () => {
    const onChange = vi.fn();
    mount(
      <AutomationConditionFields
        condition={{ ...blankCondition(STAGE, "in"), values: ["won", "archived"] }}
        flagged={false}
        model={MODEL}
        typeId={DEALS}
        unavailable="option"
        onChange={onChange}
      />,
    );

    expect(checkboxes().map((box) => box.getAttribute("aria-checked"))).toEqual(["true", "false", "true"]);
    expect(container.querySelector('[data-automation-unavailable="option"]')?.textContent).toBe(
      "Automations.unavailable.option",
    );
    expect(container.textContent).toContain("Automations.unavailable.item");

    act(() => checkboxes()[1]?.click());
    expect(onChange).toHaveBeenLastCalledWith({ values: ["won", "archived", "lost"] });
    act(() => checkboxes()[2]?.click());
    expect(onChange).toHaveBeenLastCalledWith({ values: ["won"] });
  });

  it("offers a member or a date and time field only comparisons that can be saved", () => {
    mount(
      <AutomationConditionFields
        condition={blankCondition(OWNER, "empty")}
        flagged={false}
        model={MODEL}
        typeId={DEALS}
        onChange={vi.fn()}
      />,
    );
    expect(offered("empty")).toEqual(["empty", "notEmpty"]);

    mount(
      <AutomationConditionFields
        condition={blankCondition(MEETING, "notEmpty")}
        flagged={false}
        model={MODEL}
        typeId={DEALS}
        onChange={vi.fn()}
      />,
    );
    expect(offered("notEmpty")).toEqual(["empty", "notEmpty", "before", "after"]);
  });
});

describe("the trigger card", () => {
  it("shows a trigger set outside the builder read-only and offers to replace it", () => {
    const onChange = vi.fn();
    const kept = { kind: "formSubmitted" as const, sourceId: "77777777-7777-4777-8777-777777777777" };
    mount(
      <AutomationTriggerEditor
        flagged={() => false}
        model={MODEL}
        trigger={{ ...TRIGGER, kind: "other", kept }}
        onChange={onChange}
      />,
    );

    expect(container.querySelector('[data-automation-kept="trigger"]')?.textContent).toBe(
      "AutomationRules.builder.keptTrigger",
    );
    expect(container.querySelectorAll("[data-select], input")).toHaveLength(0);

    act(() => container.querySelector("button")?.click());
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "recordCreated", kept: null, typeId: DEALS }),
    );
  });

  it("edits several fields of an updated-record trigger and the channel of a message trigger", () => {
    const onChange = vi.fn();
    mount(
      <AutomationTriggerEditor
        flagged={() => false}
        model={MODEL}
        trigger={{ ...TRIGGER, kind: "recordUpdated", fieldIds: [STAGE] }}
        onChange={onChange}
      />,
    );

    expect(checkboxes().map((box) => box.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "false"]);
    act(() => checkboxes()[0]?.click());
    expect(onChange).toHaveBeenLastCalledWith({ fieldIds: [STAGE, NAME] });

    mount(
      <AutomationTriggerEditor
        flagged={() => false}
        model={MODEL}
        trigger={{ ...TRIGGER, kind: "messageReceived", channel: "email" }}
        onChange={onChange}
      />,
    );
    expect(offered("email")).toEqual(["any", "email", "chat"]);
  });

  it("gives every field of a row a flex basis so the row wraps on a phone (class contract, no browser run)", () => {
    mount(
      <AutomationTriggerEditor
        flagged={() => false}
        model={MODEL}
        trigger={{ ...TRIGGER, kind: "dateReached", fieldId: MEETING }}
        onChange={vi.fn()}
      />,
    );

    const rows = [...container.querySelectorAll("[data-automation-field-row]")];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const fields = [...row.querySelectorAll(":scope > [data-automation-field]")];
      expect(row.classList.contains("flex-wrap")).toBe(true);
      expect(fields.length).toBeGreaterThan(2);
      for (const item of fields) {
        expect(["basis-40", "grow", "min-w-0"].every((name) => item.classList.contains(name))).toBe(true);
        expect(item.classList.contains("flex-1")).toBe(false);
      }
    }

    mount(
      <AutomationTriggerEditor
        flagged={() => false}
        model={MODEL}
        trigger={{ ...TRIGGER, kind: "recordUpdated" }}
        onChange={vi.fn()}
      />,
    );
    const stacked = container.querySelector("[data-automation-pick-many]")?.closest("[data-automation-field]");
    expect(stacked?.closest("[data-automation-field-row]")).toBeNull();
    expect(stacked?.classList.contains("basis-40")).toBe(false);
  });

  it("asks for a target value only where the field can hold one", () => {
    const toValue = () => container.textContent?.includes("AutomationRules.builder.toValue");
    mount(
      <AutomationTriggerEditor
        flagged={() => false}
        model={MODEL}
        trigger={{ ...TRIGGER, kind: "fieldChanged", fieldId: OWNER }}
        onChange={vi.fn()}
      />,
    );
    expect(toValue()).toBe(false);

    mount(
      <AutomationTriggerEditor
        flagged={() => false}
        model={MODEL}
        trigger={{ ...TRIGGER, kind: "fieldChanged", fieldId: STAGE }}
        onChange={vi.fn()}
      />,
    );
    expect(toValue()).toBe(true);
  });
});

describe("the step palette and the keyboard", () => {
  function chainStore(webhooks: [] | null = []) {
    const store = new AutomationBuilderStore({
      registerModalStore: vi.fn(),
      userStore: { user: { id: "u", role: { isSystemRole: false } }, can: vi.fn(() => true) },
      localeStore: { getTranslation: (key: string) => key },
    } as unknown as RootStore);
    act(() => {
      store.openForCreate(
        { model: MODEL, runtimes: runtimes(), webhooks, composer: false, cloud: false, timezone: "UTC" },
        vi.fn(),
        { typeId: DEALS },
      );
      store.startFromScratch();
    });
    return store;
  }

  const connectors = () => [...container.querySelectorAll<HTMLButtonElement>("[data-automation-connector] button")];

  it("closes on Escape without letting the key reach the dialog around it", () => {
    const onClose = vi.fn();
    const outer = vi.fn();
    mount(
      <div role="presentation" onKeyDown={outer}>
        <AutomationPalette disabled={new Set()} onClose={onClose} onPick={vi.fn()} />
      </div>,
    );
    const palette = container.querySelector("[data-automation-palette]");
    const search = palette?.querySelector("input");

    expect(palette?.hasAttribute("data-local-escape")).toBe(true);
    expect(search?.closest("[data-local-escape]")).toBe(palette);

    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      search?.dispatchEvent(escape);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    expect(escape.defaultPrevented).toBe(true);

    act(() => {
      search?.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("switches Call a webhook off, with the reason, for a member who cannot see webhooks", () => {
    const item = () => container.querySelector<HTMLButtonElement>('[data-automation-palette-item="callWebhook"]');

    const restricted = chainStore(null);
    mount(<AutomationCardChain store={restricted} />);
    act(() => connectors()[0]?.click());
    expect(item()?.disabled).toBe(true);
    expect(item()?.querySelector("[data-automation-palette-reason]")?.textContent).toBe(
      "Automations.palette.callWebhook.restricted",
    );
    expect(item()?.textContent).not.toContain("Automations.palette.callWebhook.hint");
    act(() => item()?.click());
    expect(restricted.form.effects).toEqual([]);

    const visible = chainStore([]);
    mount(<AutomationCardChain store={visible} />);
    act(() => connectors()[0]?.click());
    expect(item()?.disabled).toBe(false);
    expect(item()?.querySelector("[data-automation-palette-reason]")).toBeNull();
    expect(item()?.textContent).toContain("Automations.palette.callWebhook.hint");
  });

  it("puts the focus on the card that was just added", () => {
    const store = chainStore();
    mount(<AutomationCardChain store={store} />);

    act(() => connectors()[0]?.click());
    act(() => container.querySelector<HTMLButtonElement>('[data-automation-palette-item="notify"]')?.click());

    const header = container.querySelector('[data-automation-card="effect-0"] button[aria-expanded="true"]');
    expect(header).not.toBeNull();
    expect(document.activeElement).toBe(header);

    act(() => connectors()[0]?.click());
    act(() => container.querySelector<HTMLButtonElement>('[data-automation-palette-item="condition"]')?.click());
    expect(document.activeElement).toBe(
      container.querySelector('[data-automation-card="condition-0"] button[aria-expanded="true"]'),
    );
  });

  it("moves the focus to the neighbouring card, or to the last +, after a step is removed", () => {
    const store = chainStore();
    act(() => {
      store.addEffect("notify", 0);
      store.addEffect("agent", 1);
      store.addCondition(0);
    });
    mount(<AutomationCardChain store={store} />);
    const header = (card: string) =>
      container.querySelector<HTMLButtonElement>(`[data-automation-card="${card}"] button[aria-expanded]`);
    const removeOpenCard = (card: string) => {
      if (header(card)?.getAttribute("aria-expanded") !== "true") act(() => header(card)?.click());
      const buttons = [...container.querySelectorAll<HTMLButtonElement>(`[data-automation-card="${card}"] button`)];
      act(() => buttons.find((button) => button.textContent === "Automations.builder.removeStep")?.click());
    };

    removeOpenCard("condition-0");
    expect(store.form.conditions).toHaveLength(0);
    expect(document.activeElement).toBe(header("effect-0"));

    removeOpenCard("effect-0");
    expect(store.form.effects.map((effect) => effect.kind)).toEqual(["agent"]);
    expect(document.activeElement).toBe(header("effect-0"));

    removeOpenCard("effect-0");
    expect(store.form.effects).toEqual([]);
    expect(connectors()).toHaveLength(1);
    expect(document.activeElement).toBe(connectors()[0]);
  });

  it("hands the focus back to the + it was opened from when it is closed without a choice", () => {
    const store = chainStore();
    act(() => store.addEffect("notify", 0));
    mount(<AutomationCardChain store={store} />);

    act(() => connectors()[1]?.click());
    const search = container.querySelector<HTMLInputElement>("[data-automation-palette] input");
    act(() => {
      search?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });

    expect(container.querySelector("[data-automation-palette]")).toBeNull();
    expect(store.isOpen).toBe(true);
    expect(document.activeElement).toBe(connectors()[1]);
  });
});

describe("a card of someone else's automation", () => {
  const card = (readOnly: boolean) => (
    <AutomationCard
      expanded
      cardId="effect-0"
      icon={Zap}
      kindLabel="Then"
      readOnly={readOnly}
      removeLabel="Remove step"
      sentence="notify the owner"
      onRemove={vi.fn()}
      onToggle={vi.fn()}
    >
      <input aria-label="Title" />
    </AutomationCard>
  );

  it("can be opened and read, but every field in it is switched off and it cannot be removed", () => {
    mount(card(true));

    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    expect(container.querySelector("input")?.matches(":disabled")).toBe(true);
    expect(container.querySelector('button[aria-expanded="true"]')?.matches(":disabled")).toBe(false);
    expect(container.textContent).not.toContain("Remove step");
  });

  it("stays editable and removable for its owner", () => {
    mount(card(false));

    expect(container.querySelector("fieldset")?.disabled).toBe(false);
    expect(container.querySelector("input")?.matches(":disabled")).toBe(false);
    expect(container.textContent).toContain("Remove step");
  });

  it("shows the line between cards without the button that adds a step", () => {
    mount(<AutomationConnector active={false} label="Add a step" />);
    expect(container.querySelector("button")).toBeNull();

    mount(<AutomationConnector active={false} label="Add a step" onAdd={vi.fn()} />);
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Add a step");
  });
});

describe("a step card", () => {
  const step = (
    effect: Parameters<typeof AutomationEffectFields>[0]["effect"],
    extra: Partial<Parameters<typeof AutomationEffectFields>[0]> = {},
  ) => (
    <AutomationEffectFields
      effect={effect}
      flagged={false}
      model={MODEL}
      runtimes={runtimes()}
      trigger={TRIGGER}
      webhooks={[]}
      onChange={vi.fn()}
      {...extra}
    />
  );

  it("says which reference is gone instead of the generic hint", () => {
    mount(step({ kind: "callWebhook", webhookId: "gone" }, { flagged: true, unavailable: "webhook" }));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Automations.unavailable.webhook");
    expect(container.textContent).not.toContain("AutomationRules.builder.fixEffect");
  });

  it("offers only webhooks that selected the automation event and says so on a step whose webhook has not", () => {
    const fires = { id: "fires", label: "Fires", subscribed: true };
    const silent = { id: "silent", label: "Silent", subscribed: false };

    mount(step({ kind: "callWebhook", webhookId: "" }, { webhooks: [fires, silent] }));
    expect(offered("")).toEqual(["fires"]);
    expect(container.querySelector("[data-automation-webhook-none]")).toBeNull();

    mount(
      step(
        { kind: "callWebhook", webhookId: "silent" },
        { webhooks: [fires, silent], flagged: true, unavailable: "webhookEvent" },
      ),
    );
    expect(offered("silent")).toEqual(["fires", "silent"]);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Automations.unavailable.webhookEvent");

    mount(step({ kind: "callWebhook", webhookId: "" }, { webhooks: [silent] }));
    expect(offered("")).toEqual([]);
    expect(container.querySelector("[data-automation-webhook-none]")?.textContent).toBe(
      "Automations.builder.webhookNoneSubscribed",
    );
  });

  it("explains a webhook step to a member who may not see webhooks instead of showing an empty picker", () => {
    mount(step({ kind: "callWebhook", webhookId: "kept" }, { webhooks: null }));

    expect(container.querySelector("[data-automation-webhook-restricted]")?.textContent).toBe(
      "Automations.builder.webhookRestricted",
    );
    expect(container.querySelector("[data-select]")).toBeNull();
  });

  it("bounds the notify title and details and the title of a new record as the server does", () => {
    const lengths = () => [...container.querySelectorAll("input")].map((input) => input.getAttribute("maxlength"));
    const notify = {
      kind: "notify" as const,
      toOwner: true,
      toAssignees: false,
      notificationKind: "ruleAlert" as const,
      title: "x".repeat(200),
      body: "y".repeat(1000),
    };
    const create = {
      kind: "createRecord" as const,
      typeId: DEALS,
      titleFieldId: NAME,
      title: "x".repeat(200),
      dueFieldId: "",
      dueDays: "",
      assignToOwner: true,
      relationId: "",
    };

    mount(step(notify));
    expect(lengths()).toEqual(["200", "1000"]);

    mount(step(create));
    expect(lengths()).toEqual(["200"]);

    const base = { name: "Limits", trigger: { kind: "recordCreated" as const, typeId: DEALS } };
    const accepted = (effect: unknown) => UpsertAutomationRuleSchema.safeParse({ ...base, effects: [effect] }).success;
    const recipients = { ruleOwner: true, assignees: false, userIds: [] };
    const sent = { kind: "notify", recipients, title: notify.title, body: notify.body };
    const made = { kind: "createRecord", typeId: DEALS, title: { fieldId: NAME, text: create.title } };
    expect(accepted(sent)).toBe(true);
    expect(accepted({ ...sent, title: `${notify.title}x` })).toBe(false);
    expect(accepted({ ...sent, body: `${notify.body}y` })).toBe(false);
    expect(accepted(made)).toBe(true);
    expect(accepted({ ...made, title: { fieldId: NAME, text: `${create.title}x` } })).toBe(false);
  });

  it("offers Set a field only fields a value can be typed for", () => {
    mount(step({ kind: "setField", fieldId: "", value: "" }));

    expect(offered("")).toEqual([NAME, STAGE]);
  });

  it("shows a kept step read-only with its note", () => {
    const effect = { kind: "setField" as const, fields: [{ fieldId: NAME, value: null }] };
    mount(step({ kind: "kept", effect }));

    expect(container.querySelector('[data-automation-kept="effect"]')?.textContent).toBe(
      "AutomationRules.builder.keptEffect:setField",
    );
  });
});
