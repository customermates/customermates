import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ getAutomationRuleRunsAction: vi.fn() }));

vi.mock("../actions", () => actions);
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) => (values?.name ? `${key}:${values.name}` : key),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatRelativeTime: () => "just now", formatTime: () => "08:00" }),
}));

const agentActions = vi.hoisted(() => ({ getAgentJobAction: vi.fn() }));

vi.mock("@/components/agent-keys/agent-key-actions", () => agentActions);

import { AutomationRunsPane } from "../components/automation-runs-pane";

const RULE_A = "00000000-0000-4000-8000-0000000000a1";
const RULE_B = "00000000-0000-4000-8000-0000000000a2";
const JOB = "99999999-9999-4999-8999-999999999999";

function run(id: string, ruleId: string, reason: string | null = null) {
  return {
    id,
    ruleId,
    status: "skipped",
    triggerKind: "recordCreated",
    typeId: null,
    recordId: null,
    occurrenceKey: `event:${id}`,
    effects: [],
    reason,
    error: null,
    scheduledFor: "2026-11-17T08:00:00.000Z",
    finishedAt: "2026-11-17T08:00:01.000Z",
    createdAt: "2026-11-17T08:00:00.000Z",
  };
}

type Page = { ok: true; data: { runs: ReturnType<typeof run>[]; nextCursor: string | null } };

function deferred() {
  let resolve: (page: Page) => void = () => undefined;
  const promise = new Promise<Page>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let container: HTMLDivElement;
let root: Root;

function render(ruleId: string, name: string) {
  return act(async () => {
    root.render(<AutomationRunsPane name={name} ruleId={ruleId} />);
    await settle();
  });
}

function shownRuns() {
  return [...container.querySelectorAll("li")].map((item) => item.textContent ?? "");
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  actions.getAutomationRuleRunsAction.mockReset();
  agentActions.getAgentJobAction.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the run history of an automation", () => {
  it("drops a further page of one automation that arrives after the builder moved on to another", async () => {
    const moreOfA = deferred();
    actions.getAutomationRuleRunsAction.mockImplementation((input: { id: string; cursor?: string }) => {
      if (input.id === RULE_A && input.cursor) return moreOfA.promise;
      if (input.id === RULE_A)
        return Promise.resolve({ ok: true, data: { runs: [run("a-1", RULE_A, "ruleDisabled")], nextCursor: "next" } });
      return Promise.resolve({ ok: true, data: { runs: [run("b-1", RULE_B, "dateChanged")], nextCursor: null } });
    });

    await render(RULE_A, "Rule A");
    expect(shownRuns()).toHaveLength(1);
    const more = container.querySelector("button");
    expect(more?.textContent).toBe("Common.actions.loadMore");
    await act(async () => {
      more?.click();
      await settle();
    });
    expect(actions.getAutomationRuleRunsAction).toHaveBeenLastCalledWith({ id: RULE_A, cursor: "next" });

    await render(RULE_B, "Rule B");
    await act(async () => {
      moreOfA.resolve({ ok: true, data: { runs: [run("a-2", RULE_A, "ownerChanged")], nextCursor: "again" } });
      await settle();
    });

    expect(shownRuns()).toHaveLength(1);
    expect(container.textContent).toContain("AutomationRules.history.title:Rule B");
    expect(container.textContent).toContain("AutomationRules.reason.dateChanged");
    expect(container.textContent).not.toContain("AutomationRules.reason.ownerChanged");
    expect(container.querySelector("button")).toBeNull();
  });

  it("says that the runs could not be loaded, instead of 'No runs yet', and loads them on Retry", async () => {
    actions.getAutomationRuleRunsAction
      .mockResolvedValueOnce({ ok: false, failure: { kind: "unavailable", issues: [] } })
      .mockResolvedValueOnce({ ok: true, data: { runs: [run("a-1", RULE_A)], nextCursor: null } });

    await render(RULE_A, "Rule A");
    const error = container.querySelector("[data-automation-runs-error]");
    expect(error?.textContent).toContain("AutomationRules.history.loadFailed");
    expect(container.textContent).not.toContain("AutomationRules.history.empty");

    await act(async () => {
      error?.querySelector("button")?.click();
      await settle();
    });
    expect(container.querySelector("[data-automation-runs-error]")).toBeNull();
    expect(shownRuns()).toHaveLength(1);
  });

  it("keeps the runs it has when a further page fails and retries that page", async () => {
    actions.getAutomationRuleRunsAction
      .mockResolvedValueOnce({ ok: true, data: { runs: [run("a-1", RULE_A)], nextCursor: "next" } })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, data: { runs: [run("a-2", RULE_A)], nextCursor: null } });

    await render(RULE_A, "Rule A");
    await act(async () => {
      container.querySelector("button")?.click();
      await settle();
    });
    expect(shownRuns()).toHaveLength(1);
    const retry = container.querySelector<HTMLButtonElement>("[data-automation-runs-error] button");
    expect(retry?.textContent).toBe("ErrorCard.retry");
    expect([...container.querySelectorAll("button")]).toHaveLength(1);

    await act(async () => {
      retry?.click();
      await settle();
    });
    expect(actions.getAutomationRuleRunsAction).toHaveBeenLastCalledWith({ id: RULE_A, cursor: "next" });
    expect(shownRuns()).toHaveLength(2);
  });

  it("opens the agent run of an applied agent step, with its status and transcript, and loads it once", async () => {
    const effects = [
      { kind: "agent", status: "applied", detail: JOB },
      { kind: "notify", status: "applied", detail: "2" },
      { kind: "agent", status: "failed", detail: "agentJobRefused" },
    ];
    actions.getAutomationRuleRunsAction.mockResolvedValue({
      ok: true,
      data: { runs: [{ ...run("a-1", RULE_A), status: "succeeded", effects }], nextCursor: null },
    });
    agentActions.getAgentJobAction.mockResolvedValue({
      ok: true,
      data: {
        id: JOB,
        status: "succeeded",
        error: null,
        promptUntrusted: false,
        transcript: [{ type: "message", role: "assistant", text: "Drafted the reply", at: "2026-11-17T08:00:02.000Z" }],
      },
    });

    await render(RULE_A, "Rule A");
    const steps = [...container.querySelectorAll("[data-automation-run-agent]")];
    expect(steps.map((step) => step.getAttribute("data-automation-run-agent"))).toEqual([JOB]);
    const toggle = steps[0]?.querySelector("button");
    expect(toggle?.textContent).toBe("Automations.runs.agentRun");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(agentActions.getAgentJobAction).not.toHaveBeenCalled();

    const press = () =>
      act(async () => {
        toggle?.click();
        await settle();
      });
    await press();
    expect(agentActions.getAgentJobAction).toHaveBeenCalledWith({ id: JOB });
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(steps[0]?.textContent).toContain("AgentJobs.status.succeeded");
    expect(steps[0]?.textContent).toContain("Drafted the reply");

    await press();
    expect(steps[0]?.textContent).not.toContain("Drafted the reply");
    await press();
    expect(steps[0]?.textContent).toContain("Drafted the reply");
    expect(agentActions.getAgentJobAction).toHaveBeenCalledTimes(1);
  });

  it("says so when the agent run of a step cannot be loaded", async () => {
    actions.getAutomationRuleRunsAction.mockResolvedValue({
      ok: true,
      data: {
        runs: [{ ...run("a-1", RULE_A), effects: [{ kind: "agent", status: "applied", detail: JOB }] }],
        nextCursor: null,
      },
    });
    agentActions.getAgentJobAction.mockResolvedValue({ ok: false, failure: { kind: "not_found", issues: [] } });

    await render(RULE_A, "Rule A");
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-automation-run-agent] button")?.click();
      await settle();
    });

    expect(container.querySelector('[data-automation-run-agent] [role="alert"]')?.textContent).toBe(
      "AgentJobs.loadFailed",
    );
  });

  it("appends the next page of the automation that is still open", async () => {
    actions.getAutomationRuleRunsAction.mockImplementation((input: { id: string; cursor?: string }) =>
      Promise.resolve(
        input.cursor
          ? { ok: true, data: { runs: [run("a-2", RULE_A)], nextCursor: null } }
          : { ok: true, data: { runs: [run("a-1", RULE_A)], nextCursor: "next" } },
      ),
    );

    await render(RULE_A, "Rule A");
    await act(async () => {
      container.querySelector("button")?.click();
      await settle();
    });

    expect(shownRuns()).toHaveLength(2);
    expect(container.querySelector("button")).toBeNull();
  });
});
