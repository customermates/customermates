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
  useHydratedIntlStore: () => ({ formatRelativeTime: () => "just now" }),
}));

import { AutomationRunsPane } from "../components/automation-runs-pane";

const RULE_A = "00000000-0000-4000-8000-0000000000a1";
const RULE_B = "00000000-0000-4000-8000-0000000000a2";

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
