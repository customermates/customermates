import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { DraftAgent } from "../components/automation-draft";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) => (values?.name ? `${key}:${values.name}` : key),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: { children: ReactNode; value: string }) => <div data-select={value}>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <li data-value={value}>{children}</li>,
}));

import { AGENT_SETTINGS_HREF, AutomationAgentFields } from "../components/automation-agent-fields";
import { blankAgentEffect } from "../components/automation-draft";

const RUNNER = "88888888-8888-4888-8888-888888888888";

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

  it("keeps the prompt in the effect and bounds its length", () => {
    const effect = blankAgentEffect("mate");
    const onChange = render(effect, runtimes({ mate: AVAILABLE }));
    const prompt = container.querySelector("textarea");

    expect(prompt?.getAttribute("maxlength")).toBe("4000");
    expect(prompt?.getAttribute("aria-invalid")).toBeNull();

    render(effect, runtimes({ mate: AVAILABLE }), onChange, true);
    expect(container.querySelector("textarea")?.getAttribute("aria-invalid")).toBe("true");
  });
});
