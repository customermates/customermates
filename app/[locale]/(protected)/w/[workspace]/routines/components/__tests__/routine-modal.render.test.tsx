import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoutineTriggerKind } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  store: null as unknown as TestRoutineStore,
  wide: false,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/hooks/use-media-query", () => ({
  useIsWiderThan: () => harness.wide,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ routineModalStore: harness.store, routineRunChatStore: {} }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatRelativeTime: () => "just now", formatTime: () => "08:00" }),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));
vi.mock("@/app/components/agent-chat/agent-chat-store-context", () => ({
  AgentChatStoreProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/app/components/agent-chat/agent-route-reload", () => ({
  AgentRouteReloadBridge: () => null,
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showConfirmation: vi.fn(), showTrashConfirmation: vi.fn() }),
}));
vi.mock("@/components/modal", () => ({
  AppModal: ({
    actions = [],
    controls,
    children,
  }: {
    actions?: { id: string; label: string; onClick: () => unknown }[];
    controls?: { node: ReactNode };
    children: ReactNode;
  }) => (
    <div data-modal>
      {controls?.node}

      <div data-modal-actions>
        {actions.map((action) => (
          <button key={action.id} id={action.id} type="button" onClick={() => void action.onClick()}>
            {action.label}
          </button>
        ))}
      </div>

      {children}
    </div>
  ),
}));
vi.mock("@/components/card/app-card", () => ({
  AppCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/card/app-card-header", () => ({
  AppCardHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));
vi.mock("@/components/automations/canvas/automation-flow-canvas", async () => {
  const { AutomationStepColumn } = await import("@/components/automations/canvas/automation-step-column");
  return {
    AutomationFlowCanvas: (props: Parameters<typeof AutomationStepColumn>[0]) => (
      <div data-flow>
        <AutomationStepColumn {...props} />
      </div>
    ),
  };
});
vi.mock("@/components/forms/unsaved-changes-bar", () => ({
  UnsavedChangesBar: ({ store }: { store: { canManage: boolean; hasUnsavedChanges: boolean } }) =>
    store.canManage && store.hasUnsavedChanges ? (
      <div data-slot="unsaved-changes-bar">
        <button id="routine-modal-save" type="submit">
          save
        </button>
      </div>
    ) : null,
}));
vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children: ReactNode }) => <form>{children}</form>,
}));
vi.mock("../routine-configuration-pane", () => ({
  RoutineConfigurationPane: ({ store }: { store: { isReadOnly: boolean } }) => (
    <div data-configuration-pane data-read-only={store.isReadOnly}>
      configuration
    </div>
  ),
}));
vi.mock("../routine-trigger-fields", () => ({
  RoutineTriggerFields: () => <div data-trigger-fields>trigger</div>,
}));
vi.mock("../routine-agent-fields", () => ({
  RoutineAgentFields: () => <div data-agent-fields>agent</div>,
}));
vi.mock("../routine-run-detail", () => ({
  ROUTINE_RUN_CHAT_UI_TARGETS: {},
  RoutineRunDetail: ({ run }: { run: { id: string } }) => <div data-run-detail={run.id}>detail</div>,
}));
vi.mock("../routine-runs-pane", () => ({
  RoutineRunsPane: () => (
    <div data-runs-pane>
      <button id="routine-run-run-1" type="button">
        run
      </button>
    </div>
  ),
}));

import { RoutineModal } from "../routine-modal";

class TestRoutineStore {
  activeTab: "details" | "runs" = "runs";
  selectedStep: "trigger" | "agent" | null = null;
  form = {
    id: "routine-1" as string | undefined,
    name: "Daily digest",
    prompt: "Draft follow-ups for deals due today",
    enabled: true,
    triggerKind: RoutineTriggerKind.schedule,
    timezone: "Europe/Berlin",
    triggerEvents: [] as string[],
    owner: { firstName: "Max", lastName: "Bergmann", avatarUrl: null, status: "active" },
  };
  openRun_: { id: string; status: string; createdAt: Date } | null = null;
  hasUnsavedChanges = false;
  isOwner = true;
  isAdmin = false;
  canManage = true;
  canCreate = true;
  isLoading = false;
  isStartingRun = false;
  latestRunAt: Date | null = null;
  compiledCron = "0 8 * * 1-5";
  rootStore = { userStore: { user: null }, automationsStore: { refresh: vi.fn() } };

  get isReadOnly() {
    return !this.canManage;
  }

  get canAdministerOtherRoutine() {
    return this.isAdmin && !this.isOwner;
  }

  allows = () => this.canCreate;
  getError = () => undefined;
  onChange = vi.fn();
  setActiveTab = (value: "details" | "runs") => {
    this.activeTab = value;
  };
  selectStep = (step: "trigger" | "agent" | null) => {
    this.selectedStep = step;
  };
  closeRun = () => {
    this.openRun_ = null;
  };
  runNow = vi.fn();
  duplicate = vi.fn();
  delete = vi.fn();
  pause = vi.fn();
}

let container: HTMLDivElement;
let root: Root;
let renderVersion = 0;

function render() {
  renderVersion += 1;
  act(() => root.render(<RoutineModal key={renderVersion} />));
}

function expectUniqueIds() {
  const ids = [...container.querySelectorAll<HTMLElement>("[id]")].map(({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
}

const step = (id: string) => container.querySelector<HTMLButtonElement>(`[data-automation-step="${id}"]`);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.store = new TestRoutineStore();
  harness.wide = false;
  renderVersion = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("RoutineModal on the automation canvas", () => {
  it("renders a routine as a schedule trigger and one Ask the agent node with the Mate badge", () => {
    render();

    expect(
      [...container.querySelectorAll("[data-automation-step]")].map((node) =>
        node.getAttribute("data-automation-step"),
      ),
    ).toEqual(["trigger", "agent"]);
    expect(step("trigger")?.textContent).toContain("Automations.builder.when");
    expect(step("agent")?.textContent).toContain("Automations.canvas.agentStep");
    expect(step("agent")?.textContent).toContain("Automations.runsOn.mate");
    expect(step("agent")?.textContent).toContain("Draft follow-ups for deals due today");
    expect(container.querySelector("[data-automation-add]")).toBeNull();
    expect(container.querySelector("[data-automation-step-toolbar]")).toBeNull();
    expect(container.querySelector("[data-automation-runtime]")?.textContent).toBe("Automations.canvas.runtime.mate");
    expectUniqueIds();
  });

  it("opens the instructions in the panel when the agent node is chosen, and the schedule for the trigger", () => {
    render();
    expect(container.querySelector("[data-runs-pane]")).not.toBeNull();

    act(() => step("agent")?.click());
    render();
    expect(harness.store.selectedStep).toBe("agent");
    expect(container.querySelector("[data-agent-fields]")).not.toBeNull();
    expect(container.querySelector("[data-runs-pane]")).toBeNull();
    expect(container.querySelector("[data-automation-panel='sheet']")).not.toBeNull();

    act(() => step("trigger")?.click());
    render();
    expect(container.querySelector("[data-trigger-fields]")).not.toBeNull();
  });

  it("shows Runs and Settings when nothing is selected, and only settings for a new routine", () => {
    render();
    expect(container.querySelector("#routine-tab-runs")).not.toBeNull();
    expect(container.querySelector("#routine-tab-details")).not.toBeNull();

    harness.store.form.id = undefined;
    render();
    expect(container.querySelector("[data-routine-layout='create']")).not.toBeNull();
    expect(container.querySelector("[data-configuration-pane]")).not.toBeNull();
    expect(container.querySelector("[role='tablist']")).toBeNull();
    expect(container.querySelector("[data-runs-pane]")).toBeNull();
    expectUniqueIds();
  });

  it("keeps a read-own owner read-only without Save, Run now, or Delete controls", () => {
    harness.store.canManage = false;
    harness.store.canCreate = false;
    harness.store.activeTab = "details";

    render();

    expect(container.querySelector("[data-configuration-pane]")?.getAttribute("data-read-only")).toBe("true");
    expect(container.querySelector("#routine-modal-save")).toBeNull();
    expect(container.querySelector("#routines-run-now")).toBeNull();
    expect(container.querySelector("#delete-routine")).toBeNull();
    expect(container.querySelector<HTMLButtonElement>("#routine-active")?.disabled).toBe(true);
  });

  it("keeps Run now for a manage-capable owner and adds Delete only for a system administrator", () => {
    render();
    expect(container.querySelector("#routines-run-now")).not.toBeNull();
    expect(container.querySelector("#routine-duplicate")).not.toBeNull();
    expect(container.querySelector("#routine-modal-save")).toBeNull();
    harness.store.hasUnsavedChanges = true;
    render();
    expect(container.querySelector('[data-slot="unsaved-changes-bar"]')).not.toBeNull();
    expect(container.querySelector("#delete-routine")).toBeNull();

    harness.store.isAdmin = true;
    render();
    expect(container.querySelector("#delete-routine")).not.toBeNull();

    harness.store.isOwner = false;
    harness.store.canManage = false;
    harness.store.hasUnsavedChanges = false;
    render();
    expect(container.querySelector("#routines-run-now")).toBeNull();
    expect(container.querySelector("#delete-routine")).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>("#routine-active")?.disabled).toBe(false);
  });

  it("replays a selected run on the canvas and returns with Back to editing", () => {
    harness.store.openRun_ = { id: "run-1", status: "failed", createdAt: new Date() };
    render();

    expect(container.querySelector("[data-routine-layout='run']")).not.toBeNull();
    expect(container.querySelector("[data-run-detail='run-1']")).not.toBeNull();
    expect(container.querySelector("[data-slot='unsaved-changes-bar']")).toBeNull();
    const mark = (id: string) =>
      step(id)?.parentElement?.querySelector("[data-automation-step-mark]")?.getAttribute("data-automation-step-mark");
    expect(mark("trigger")).toBe("ok");
    expect(mark("agent")).toBe("failed");

    act(() => container.querySelector<HTMLButtonElement>("[data-automation-replay-back]")?.click());
    render();
    expect(harness.store.openRun_).toBeNull();
    expect(container.querySelector("[data-runs-pane]")).not.toBeNull();
    expectUniqueIds();
  });

  it("uses the React Flow canvas on wide screens", () => {
    harness.wide = true;
    render();

    expect(container.querySelector("[data-flow]")).not.toBeNull();
    expect(container.querySelector("[data-automation-panel='sheet']")).toBeNull();
  });
});
