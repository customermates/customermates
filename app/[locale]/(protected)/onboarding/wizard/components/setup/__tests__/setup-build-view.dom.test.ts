import type { Root } from "react-dom/client";
import type { WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  retry: vi.fn(),
  refresh: vi.fn(),
  requestRefresh: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: unknown }) => children,
  Tooltip: ({ children }: { children: unknown }) => children,
  TooltipTrigger: ({ children }: { children: unknown }) => children,
  TooltipContent: () => null,
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: harness.refresh }) }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("../../../workspace-setup-actions", () => ({
  retryWorkspaceSetupPhaseAction: harness.retry,
  getWorkspaceSetupStatusAction: vi.fn().mockResolvedValue({ ok: false, failure: { kind: "conflict", issues: [] } }),
}));

import { DisplayType } from "@/features/widget/widget-display.schema";

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupBuildView } from "../setup-build-view";
import { phaseView, setupPlan, setupView } from "./setup-view-fixture";

let container: HTMLDivElement;
let root: Root;
let onContinue: ReturnType<typeof vi.fn<() => Promise<void>>>;
let onStandard: ReturnType<typeof vi.fn<() => Promise<void>>>;

const LIST_ID = "4a1c4b8f-4f75-4d0b-9a3e-1b5f0a2c6d71";

function building(overrides: Partial<WorkspaceSetupView>): WorkspaceSetupView {
  return setupView({
    status: "building",
    plan: { status: "completed", error: null, revision: 1, plan: setupPlan() },
    ...overrides,
  });
}

function render(setup: WorkspaceSetupView) {
  const store = new WorkspaceSetupStore({} as never);
  store.hydrate({ available: true, setup });
  harness.rootStore = {
    workspaceSetupStore: store,
    navigationGuard: { requestRouteRefreshWhenSafe: harness.requestRefresh },
  };
  act(() => root.render(createElement(SetupBuildView, { onContinue, onStandard })));
  return store;
}

function button(label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onContinue = vi.fn().mockResolvedValue(undefined);
  onStandard = vi.fn().mockResolvedValue(undefined);
  harness.retry.mockResolvedValue({ ok: true, data: { setupId: "x" } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SetupBuildView", () => {
  it("names the running phase in plain words and offers the standard setup before the data model lands", () => {
    render(
      building({
        currentPhase: "dataModel",
        phases: [
          phaseView("knowledgeBase", "running"),
          phaseView("dataModel", "running"),
          phaseView("views"),
          phaseView("records"),
          phaseView("dashboard"),
        ],
      }),
    );

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain("WorkspaceSetup.build.actions.pipeline");
    expect(status?.textContent).toContain("Lead → Demo → Won");
    expect(container.querySelector("h1")?.textContent).toBe("WorkspaceSetup.build.title");
    expect(button("WorkspaceSetup.plan.standard")).toBeDefined();
    expect(button("WorkspaceSetup.build.continue")).toBeUndefined();
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain(
      "WorkspaceSetup.build.phases.knowledgeBase",
    );
    expect(harness.requestRefresh).not.toHaveBeenCalled();
  });

  it("draws the real lists, sample records, widgets and pages as phases land", () => {
    render(
      building({
        status: "completed",
        canUseStandardSetup: false,
        phases: [
          phaseView("knowledgeBase", "completed"),
          phaseView("dataModel", "completed"),
          phaseView("views", "completed"),
          phaseView("records", "completed"),
          phaseView("dashboard", "completed"),
        ],
        results: {
          colors: { hex: "#336699", chip: "info", chart: "primary1" as never },
          lists: [
            {
              id: LIST_ID,
              key: "deal",
              name: "Deal",
              pluralName: "Opportunities",
              icon: "handshake",
              color: null,
              created: false,
              stages: ["Lead", "Demo", "Won"],
            },
          ],
          views: [],
          records: [
            { listId: LIST_ID, kind: "sample", count: 2, titles: ["Rollout Nord", "Pilot Süd"], skippedRows: 0 },
          ],
          widgets: [
            { id: "8c1b9a9e-2f43-4a77-9d38-7b9e6c2b4f10", title: "Pipeline value", display: DisplayType.number },
          ],
          pages: [{ id: "1b2f6d0e-7f5a-4c2d-8e3b-9a1c4d5e6f70", title: "Company overview" }],
        },
      }),
    );

    expect(container.querySelector("h1")?.textContent).toBe("WorkspaceSetup.build.completedTitle");
    for (const text of ["Opportunities", "Rollout Nord", "Pilot Süd", "Pipeline value", "Company overview"])
      expect(container.textContent).toContain(text);
    expect(button("WorkspaceSetup.plan.standard")).toBeUndefined();
    act(() => button("WorkspaceSetup.build.continue")?.click());
    expect(onContinue).toHaveBeenCalledOnce();
    expect(harness.requestRefresh).toHaveBeenCalledOnce();
  });

  it("keeps finished phases, states a failure and retries only that phase", async () => {
    render(
      building({
        status: "failed",
        canUseStandardSetup: false,
        phases: [
          phaseView("knowledgeBase", "completed"),
          phaseView("dataModel", "completed"),
          phaseView("views", "completed"),
          phaseView("records", "failed", "generation"),
          phaseView("dashboard", "failed", "dependency"),
        ],
      }),
    );

    expect(container.querySelector("h1")?.textContent).toBe("WorkspaceSetup.build.failedTitle");
    expect(container.textContent).toContain("WorkspaceSetup.failures.generation");
    expect(container.textContent).toContain("WorkspaceSetup.failures.dependency");
    const retries = [...container.querySelectorAll("button")].filter((candidate) =>
      candidate.textContent?.includes("WorkspaceSetup.build.retry"),
    );
    expect(retries).toHaveLength(1);

    await act(async () => {
      retries[0].click();
      await Promise.resolve();
    });
    expect(harness.retry).toHaveBeenCalledWith(expect.objectContaining({ phase: "records" }));
    expect(button("WorkspaceSetup.build.continueAnyway")).toBeDefined();
  });

  it("names no finish time while it runs", () => {
    render(building({ currentPhase: "records", phases: [phaseView("records", "running")] }));
    expect(container.textContent).not.toMatch(/minute|second|ETA/i);
    expect(container.textContent).toContain("WorkspaceSetup.build.keepsRunning");
  });
});
