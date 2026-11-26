import type { Root } from "react-dom/client";
import type { WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";

import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  retry: vi.fn(),
  completeSetupStep: vi.fn(),
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
  retryWorkspaceSetupPhaseAction: harness.retry,
  getWorkspaceSetupStatusAction: vi.fn().mockResolvedValue({ ok: false, failure: { kind: "conflict", issues: [] } }),
}));

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupBuildFooter, SetupBuildView } from "../setup-build-view";
import { PLAN_PROGRESS, phaseView, setupPlan, setupView } from "./setup-view-fixture";

let container: HTMLDivElement;
let root: Root;

function building(overrides: Partial<WorkspaceSetupView>): WorkspaceSetupView {
  return setupView({
    status: "building",
    plan: { status: "completed", error: null, revision: 1, plan: setupPlan(), ...PLAN_PROGRESS },
    ...overrides,
  });
}

function render(setup: WorkspaceSetupView, isSubmitting = false) {
  const store = new WorkspaceSetupStore({ localeStore: { locale: "en" } } as never);
  store.hydrate({ available: true, setup });
  harness.rootStore = {
    workspaceSetupStore: store,
    onboardingWizardStore: { isSubmitting, completeSetupStep: harness.completeSetupStep },
  };
  act(() => root.render(createElement(Fragment, null, createElement(SetupBuildView), createElement(SetupBuildFooter))));
  return store;
}

function button(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
}

function phaseState(key: string) {
  return container.querySelector(`[data-phase="${key}"]`)?.getAttribute("data-state");
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.completeSetupStep.mockResolvedValue(undefined);
  harness.retry.mockResolvedValue({ ok: true, data: { setupId: "x" } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SetupBuildView", () => {
  it("lists every phase with its state, lists first and the Knowledge Base last", () => {
    render(
      building({
        phases: [
          phaseView("knowledgeBase", "running"),
          phaseView("dataModel", "completed"),
          phaseView("views", "running"),
          phaseView("records"),
          phaseView("dashboard"),
        ],
        results: {
          colors: null,
          lists: [{ key: "deal", id: "1", pluralName: "Deals", icon: "handshake", color: null, stages: [] }],
          views: [],
          records: [],
          widgets: [],
          pages: [],
        } as unknown as WorkspaceSetupView["results"],
      }),
    );

    const phases = [...container.querySelectorAll("[data-phase]")].map((item) => item.getAttribute("data-phase"));
    expect(phases).toEqual(["dataModel", "views", "records", "dashboard", "knowledgeBase"]);
    expect(phaseState("dataModel")).toBe("done");
    expect(phaseState("views")).toBe("active");
    expect(phaseState("records")).toBe("waiting");
    expect(container.textContent).toContain("WorkspaceSetup.build.summaries.dataModel 1");
    expect(container.textContent).toContain("WorkspaceSetup.build.keepsRunning");
    expect(container.textContent).toContain("WorkspaceSetup.build.eyebrow");
  });

  it("lets the owner continue while the build still runs", () => {
    render(building({ phases: [phaseView("dataModel", "running")] }));

    act(() => button("OnboardingWizard.continue")?.click());

    expect(harness.completeSetupStep).toHaveBeenCalledOnce();
  });

  it("disables Continue while the wizard is already moving on", () => {
    render(building({}), true);

    expect(button("OnboardingWizard.continue")?.disabled).toBe(true);
  });

  it("offers a retry on a failed phase and sends it", async () => {
    render(
      setupView({
        status: "failed",
        phases: [phaseView("dataModel", "completed"), phaseView("records", "failed", "generation")],
      }),
    );

    expect(phaseState("records")).toBe("failed");
    expect(container.textContent).toContain("WorkspaceSetup.failures.generation");
    await act(() => {
      button("WorkspaceSetup.build.retry")?.click();
      return Promise.resolve();
    });

    expect(harness.retry).toHaveBeenCalledWith({ setupId: expect.any(String), phase: "records" });
    expect(container.textContent).toContain("WorkspaceSetup.build.failedTitle");
  });

  it("offers no retry for a phase that waits on another one", () => {
    render(setupView({ status: "failed", phases: [phaseView("views", "failed", "dependency")] }));

    expect(button("WorkspaceSetup.build.retry")).toBeUndefined();
  });

  it("reports a finished workspace", () => {
    render(setupView({ status: "completed", phases: [phaseView("dataModel", "completed")] }));

    expect(container.textContent).toContain("WorkspaceSetup.build.completedTitle");
    expect(container.textContent).toContain("WorkspaceSetup.build.completedBody");
  });
});
