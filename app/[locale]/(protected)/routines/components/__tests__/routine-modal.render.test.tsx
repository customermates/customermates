import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoutineTriggerKind } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  breakpoint: "",
  store: null as unknown as TestRoutineStore,
  wide: true,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/hooks/use-media-query", () => ({
  useIsWiderThan: (breakpoint: string) => {
    harness.breakpoint = breakpoint;
    return harness.wide;
  },
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ routineModalStore: harness.store }),
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showConfirmation: vi.fn(), showDeleteConfirmation: vi.fn() }),
}));
vi.mock("@/components/modal", () => ({
  AppModal: ({
    actions = [],
    children,
    size,
  }: {
    actions?: { id: string; label: string; onClick: () => unknown }[];
    children: ReactNode;
    size: string;
  }) => (
    <div data-modal-size={size}>
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
vi.mock("@/components/card/app-card-body", () => ({
  AppCardBody: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <div data-app-card-body {...props}>
      {children}
    </div>
  ),
}));
vi.mock("@/components/card/form-actions", () => ({ FormActions: () => <div data-form-actions /> }));
vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children: ReactNode }) => <form>{children}</form>,
}));
vi.mock("../routine-configuration-pane", () => ({
  RoutineConfigurationPane: () => <div data-configuration-pane>configuration</div>,
}));
vi.mock("../routine-run-detail", () => ({
  RoutineRunDetail: ({ run }: { run: { id: string } }) => <div data-run-detail={run.id}>detail</div>,
}));
vi.mock("../routine-runs-pane", () => ({
  RoutineRunsPane: ({ store, wide }: { store: TestRoutineStore; wide: boolean }) =>
    wide && store.openRun_ ? (
      <div data-run-detail={store.openRun_.id}>detail</div>
    ) : (
      <div data-runs-pane={wide ? "wide" : "compact"}>
        <button id="routine-run-run-1" type="button">
          run
        </button>
      </div>
    ),
}));

import { RoutineModal } from "../routine-modal";

class TestRoutineStore {
  activeTab: "details" | "runs" = "details";
  form = {
    id: "routine-1" as string | undefined,
    name: "Daily digest",
    enabled: true,
    triggerKind: RoutineTriggerKind.schedule,
  };
  openRun_: { id: string } | null = null;
  hasUnsavedChanges = false;
  isOwner = true;
  isAdmin = false;
  isLoading = false;
  isStartingRun = false;

  setActiveTab = (value: "details" | "runs") => {
    this.activeTab = value;
  };
  closeRun = () => {
    this.openRun_ = null;
  };
  runNow = vi.fn();
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

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.store = new TestRoutineStore();
  harness.wide = true;
  harness.breakpoint = "";
  renderVersion = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("RoutineModal responsive rendering", () => {
  it("renders existing routines as a 5xl split with no desktop tablist", () => {
    render();

    expect(harness.breakpoint).toBe("lg");
    expect(container.querySelector("[data-modal-size='5xl']")).not.toBeNull();
    expect(container.querySelector("[data-routine-layout='wide']")).not.toBeNull();
    expect(container.querySelector("[data-configuration-pane]")).not.toBeNull();
    expect(container.querySelector("[data-runs-pane='wide']")).not.toBeNull();
    expect(container.querySelector("[role='tablist']")).toBeNull();
    expectUniqueIds();
  });

  it("renders compact Details/Runs tabs and keeps create configuration-only", () => {
    harness.wide = false;
    render();

    expect(container.querySelector("[data-modal-size='lg']")).not.toBeNull();
    expect(container.querySelector("[role='tablist']")).not.toBeNull();
    expect(container.querySelector("#routine-tab-details")).not.toBeNull();
    expect(container.querySelector("#routine-tab-runs")).not.toBeNull();
    expectUniqueIds();

    harness.store.form.id = undefined;
    render();
    expect(container.querySelector("[data-routine-layout='create']")).not.toBeNull();
    expect(container.querySelector("[data-configuration-pane]")).not.toBeNull();
    expect(container.querySelector("[role='tablist']")).toBeNull();
    expect(container.querySelector("[data-runs-pane]")).toBeNull();
    expectUniqueIds();
  });

  it("preserves a selected run across resize and returns to compact Runs", () => {
    harness.store.openRun_ = { id: "run-1" };
    harness.store.activeTab = "runs";
    render();
    expect(container.querySelector("[data-configuration-pane]")).not.toBeNull();
    expect(container.querySelector("[data-run-detail='run-1']")).not.toBeNull();

    harness.wide = false;
    render();
    expect(harness.store.openRun_?.id).toBe("run-1");
    expect(container.querySelector("[data-routine-layout='compact-run']")).not.toBeNull();
    expect(container.querySelector("[data-configuration-pane]")).toBeNull();
    expectUniqueIds();

    act(() => container.querySelector<HTMLButtonElement>("#routine-run-back")?.click());
    render();
    expect(harness.store.openRun_).toBeNull();
    expect(harness.store.activeTab).toBe("runs");
    expect(container.querySelector("[data-runs-pane='compact']")).not.toBeNull();
    expectUniqueIds();
  });
});
