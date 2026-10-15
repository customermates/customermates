import type { Root } from "react-dom/client";
import type { WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  plan: vi.fn(),
  status: vi.fn(),
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
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("../../../workspace-setup-actions", () => ({
  planWorkspaceSetupAction: harness.plan,
  getWorkspaceSetupStatusAction: harness.status,
}));

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupPlanFailed, SetupPlanPreview } from "../setup-plan-preview";
import { setupPlan, setupView } from "./setup-view-fixture";

const FOOTER_CLASSES = ["flex-col-reverse", "border-t", "pt-4", "sm:flex-row", "sm:justify-end"];

let container: HTMLDivElement;
let root: Root;

function render(component: typeof SetupPlanFailed, setup: WorkspaceSetupView) {
  const store = new WorkspaceSetupStore({} as never);
  store.hydrate({ available: true, setup });
  harness.rootStore = { workspaceSetupStore: store };
  act(() => root.render(createElement(component)));
  return store;
}

function buttons() {
  return [...container.querySelectorAll<HTMLButtonElement>("button")];
}

function button(label: string) {
  const found = buttons().find((candidate) => candidate.textContent?.includes(label));
  if (!found) throw new Error(`Button ${label} did not render.`);
  return found;
}

function footerOf(label: string) {
  const footer = button(label).parentElement;
  if (!footer) throw new Error(`Button ${label} has no footer.`);
  expect(footer.className.split(" ")).toEqual(expect.arrayContaining(FOOTER_CLASSES));
  return footer;
}

function labels(footer: HTMLElement) {
  return [...footer.children].map((child) => child.textContent);
}

function failedPlan(error: WorkspaceSetupView["plan"]["error"]) {
  return setupView({ plan: { status: "failed", error, revision: 0, plan: null } });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.plan.mockResolvedValue({ ok: true, data: { planRevision: 1 } });
  harness.status.mockResolvedValue({ ok: true, data: { available: true, setup: setupView() } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SetupPlanFailed", () => {
  it("lays out Adjust answers and Try again like the plan preview footer, Try again on top on phones", () => {
    render(
      SetupPlanPreview,
      setupView({ status: "planned", plan: { status: "completed", error: null, revision: 1, plan: setupPlan() } }),
    );
    const previewFooter = footerOf("WorkspaceSetup.plan.build");
    expect(labels(previewFooter)).toEqual(["WorkspaceSetup.plan.adjust", "WorkspaceSetup.plan.build"]);
    const previewClassName = previewFooter.className;

    render(SetupPlanFailed, failedPlan("generation"));
    const footer = footerOf("WorkspaceSetup.plan.tryAgain");
    expect(footer.className).toBe(previewClassName);
    expect(labels(footer)).toEqual(["WorkspaceSetup.plan.adjust", "WorkspaceSetup.plan.tryAgain"]);
    expect(button("WorkspaceSetup.plan.adjust").getAttribute("data-variant")).toBe("secondary");
    expect(container.textContent).toContain("WorkspaceSetup.failures.generation");
  });

  it("drafts the plan again from Try again", async () => {
    render(SetupPlanFailed, failedPlan("aiUnavailable"));

    await act(async () => {
      button("WorkspaceSetup.plan.tryAgain").click();
      await Promise.resolve();
    });
    expect(harness.plan).toHaveBeenCalledWith({ setupId: expect.any(String) });
  });

  it("offers only the support contact, as a secondary action in the same footer, when the budget is used up", () => {
    render(SetupPlanFailed, failedPlan("spendCap"));

    expect(buttons().map((candidate) => candidate.textContent)).toEqual(["WorkspaceSetup.failures.contactSupport"]);
    const footer = footerOf("WorkspaceSetup.failures.contactSupport");
    expect(labels(footer)).toEqual(["WorkspaceSetup.failures.contactSupport"]);
    expect(button("WorkspaceSetup.failures.contactSupport").getAttribute("data-variant")).toBe("secondary");
    expect(container.textContent).toContain("WorkspaceSetup.failures.spendCap");
  });
});
