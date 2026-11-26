import type { Root } from "react-dom/client";

import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  back: vi.fn(),
  save: vi.fn(),
  plan: vi.fn(),
}));

vi.mock("next-intl", () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key;
  t.raw = (key: string) => (key.startsWith("WorkspaceSetup.suggestedSteps.") ? ["Inquiry", "Proposal", "Won"] : key);
  return { useTranslations: () => t };
});
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("../../../workspace-setup-actions", () => ({
  saveWorkspaceSetupAnswersAction: harness.save,
  planWorkspaceSetupAction: harness.plan,
  getWorkspaceSetupStatusAction: vi.fn().mockResolvedValue({ ok: false, failure: { kind: "conflict", issues: [] } }),
}));

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupQuestions, SetupQuestionsFooter } from "../setup-questions";
import { setupView } from "./setup-view-fixture";

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceSetupStore;

function render() {
  act(() =>
    root.render(createElement(Fragment, null, createElement(SetupQuestions), createElement(SetupQuestionsFooter))),
  );
}

function button(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label || candidate.textContent?.includes(label),
  );
}

function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  store = new WorkspaceSetupStore({ localeStore: { locale: "en" } } as never);
  store.hydrate({ available: true, setup: setupView() });
  harness.rootStore = {
    workspaceSetupStore: store,
    onboardingWizardStore: { isFirstStep: false, isBusy: false, back: harness.back },
  };
  harness.save.mockResolvedValue({ ok: true, data: { answers: {} } });
  harness.plan.mockResolvedValue({ ok: true, data: { planRevision: 1 } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SetupQuestions", () => {
  it("asks who the owner works with and moves on as soon as one is picked", () => {
    render();
    expect(container.querySelector("#setup-question-pick-hint")).not.toBeNull();
    expect(container.querySelectorAll("kbd")).toHaveLength(3);

    act(() => container.querySelector<HTMLButtonElement>("#setup-workWith-clients")?.click());

    expect(store.answers.workWith?.value).toEqual({ format: "singleChoice", value: "clients" });
    expect(store.currentQuestion.id).toBe("purpose");
  });

  it("picks a numbered answer with the keyboard", () => {
    render();

    press("2");

    expect(store.answers.workWith?.value).toEqual({ format: "singleChoice", value: "customers" });
    expect(store.currentQuestion.id).toBe("purpose");
  });

  it("goes back to the previous wizard step from the first question", () => {
    render();

    act(() => button("Common.actions.back")?.click());

    expect(harness.back).toHaveBeenCalledOnce();
  });

  it("shows five things to track first and the rest on request", () => {
    store.setAnswer("workWith", { format: "singleChoice", value: "clients" });
    store.nextQuestion("x");
    render();

    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(5);
    act(() => button("WorkspaceSetup.interview.showMore 6")?.click());
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(11);
  });

  it("suggests the steps and keeps them when the owner continues", () => {
    store.setAnswer("workWith", { format: "singleChoice", value: "clients" });
    store.nextQuestion("x");
    store.setAnswer("purpose", { format: "multipleChoice", values: ["deals"], custom: [] });
    store.nextQuestion("x");
    render();

    const inputs = [...container.querySelectorAll<HTMLInputElement>("input")].map((input) => input.value);
    expect(inputs).toEqual(["Inquiry", "Proposal", "Won"]);
    act(() => button("OnboardingWizard.continue")?.click());

    expect(store.answers.mainSteps?.value).toEqual({
      format: "orderedList",
      items: [{ label: "Inquiry" }, { label: "Proposal" }, { label: "Won" }],
    });
    expect(store.currentQuestion.id).toBe("charge");
  });

  it("switches example records off and shows the plan from the last question", async () => {
    store.setAnswer("workWith", { format: "singleChoice", value: "ownWork" });
    store.setAnswer("purpose", { format: "multipleChoice", values: ["finances"], custom: [] });
    store.nextQuestion("x");
    store.nextQuestion("x");
    render();
    expect(store.currentQuestion.id).toBe("charge");
    expect(container.querySelector("#setup-pricing-fixedPrice")).toBeNull();

    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    act(() => toggle?.click());
    expect(store.answers.existingData?.value).toEqual({ format: "singleChoice", value: "empty" });

    await act(() => {
      button("WorkspaceSetup.interview.showPlan")?.click();
      return Promise.resolve();
    });

    expect(harness.save).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: expect.objectContaining({ existingData: { format: "singleChoice", value: "empty" } }),
      }),
    );
    expect(harness.plan).toHaveBeenCalled();
  });
});
