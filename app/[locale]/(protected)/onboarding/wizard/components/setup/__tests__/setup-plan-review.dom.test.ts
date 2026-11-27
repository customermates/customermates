import type { Root } from "react-dom/client";
import type { WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";

import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  confirm: vi.fn(),
  plan: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("../../../workspace-setup-actions", () => ({
  confirmWorkspaceSetupAction: harness.confirm,
  planWorkspaceSetupAction: harness.plan,
  getWorkspaceSetupStatusAction: vi.fn().mockResolvedValue({ ok: false, failure: { kind: "conflict", issues: [] } }),
}));

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupPlanReview, SetupPlanReviewFooter } from "../setup-plan-review";
import { PLAN_PROGRESS, SETUP_ID, setupPlan, setupView } from "./setup-view-fixture";

let container: HTMLDivElement;
let root: Root;

const user = { source: "user" as const, confidence: 1 };
const ANSWERS: WorkspaceSetupView["interview"]["answers"] = {
  workWith: { ...user, value: { format: "singleChoice", value: "clients" } },
  purpose: { ...user, value: { format: "multipleChoice", values: ["deals", "projects"], custom: [] } },
  mainSteps: { ...user, value: { format: "orderedList", items: [{ label: "A" }, { label: "B" }, { label: "C" }] } },
  pricing: { ...user, value: { format: "singleChoice", value: "timeBased" } },
  existingData: { ...user, value: { format: "singleChoice", value: "empty" } },
};

function view(overrides: Partial<WorkspaceSetupView>) {
  return setupView({ interview: { ...setupView().interview, answers: ANSWERS }, ...overrides });
}

function render(setup: WorkspaceSetupView) {
  const store = new WorkspaceSetupStore({ localeStore: { locale: "en" } } as never);
  store.hydrate({ available: true, setup });
  harness.rootStore = {
    workspaceSetupStore: store,
    onboardingWizardStore: { isSubmitting: false, completeSetupStep: vi.fn() },
  };
  act(() =>
    root.render(createElement(Fragment, null, createElement(SetupPlanReview), createElement(SetupPlanReviewFooter))),
  );
  return store;
}

function rowValue(key: string) {
  return container.querySelector(`#setup-plan-change-${key}`)?.parentElement?.textContent;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.confirm.mockResolvedValue({ ok: true, data: { setupId: SETUP_ID } });
  harness.plan.mockResolvedValue({ ok: true, data: { planRevision: 2 } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SetupPlanReview", () => {
  it("summarises the answers and the planned lists with a Change link per row", () => {
    render(
      view({
        status: "planned",
        plan: { status: "completed", error: null, revision: 2, plan: setupPlan(), ...PLAN_PROGRESS },
      }),
    );

    expect(rowValue("workWith")).toContain("WorkspaceSetup.options.workWith.clients");
    expect(rowValue("lists")).toContain("Contacts, Deals, Tasks, Projects");
    expect(rowValue("pipeline")).toContain("WorkspaceSetup.plan.rows.steps 3");
    expect(rowValue("pricing")).toContain("WorkspaceSetup.options.pricing.timeBased");
    expect(rowValue("examples")).toContain("WorkspaceSetup.plan.rows.no");
    expect(container.querySelector<HTMLButtonElement>("#setup-plan-build")?.disabled).toBe(false);
  });

  it("jumps back to the question behind a row", () => {
    const store = render(
      view({
        status: "planned",
        plan: { status: "completed", error: null, revision: 2, plan: setupPlan(), ...PLAN_PROGRESS },
      }),
    );

    act(() => container.querySelector<HTMLButtonElement>("#setup-plan-change-pricing")?.click());

    expect(store.adjusting).toBe(true);
    expect(store.stage).toBe("interview");
    expect(store.currentQuestion.id).toBe("charge");
  });

  it("builds the confirmed plan revision", async () => {
    render(
      view({
        status: "planned",
        plan: { status: "completed", error: null, revision: 2, plan: setupPlan(), ...PLAN_PROGRESS },
      }),
    );

    await act(() => {
      container.querySelector<HTMLButtonElement>("#setup-plan-build")?.click();
      return Promise.resolve();
    });

    expect(harness.confirm).toHaveBeenCalledWith({ setupId: SETUP_ID, planRevision: 2 });
  });

  it("names the answers but keeps Build and Change disabled while Mate drafts the plan", () => {
    render(view({ status: "planning" }));

    expect(rowValue("lists")).toContain("WorkspaceSetup.options.purpose.deals");
    expect(container.querySelector("#setup-plan-drafting")).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>("#setup-plan-build")?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>("#setup-plan-change-workWith")?.disabled).toBe(true);
  });

  it("offers a new attempt when the plan failed", async () => {
    render(view({ plan: { status: "failed", error: "generation", revision: 1, plan: null, ...PLAN_PROGRESS } }));

    expect(container.textContent).toContain("WorkspaceSetup.plan.failedTitle");
    await act(() => {
      container.querySelector<HTMLButtonElement>("#setup-plan-retry")?.click();
      return Promise.resolve();
    });

    expect(harness.plan).toHaveBeenCalledWith({ setupId: SETUP_ID });
  });
});
