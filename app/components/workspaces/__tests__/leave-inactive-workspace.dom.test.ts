import type { ReactElement } from "react";
import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));
const actions = vi.hoisted(() => ({
  deleteWorkspaceAction: vi.fn(),
  leaveInactiveWorkspaceAction: vi.fn(),
  leaveWorkspaceAction: vi.fn(),
  listMyWorkspacesAction: vi.fn(),
  withdrawWorkspaceRequestAction: vi.fn(),
}));

vi.mock("@/core/observability/server", () => ({ captureException: vi.fn() }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/workspaces/actions", () => actions);
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => null }));

import { InactiveCard } from "@/app/[locale]/(public)/auth/error/inactive-card";
import { PlanPausedCard } from "@/app/[locale]/(public)/auth/paused/plan-paused-card";
import { WorkspacesPageView } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/components/workspaces-page-view";

import { WorkspacesStore } from "../workspaces.store";

const BERGMANN = "00000000-0000-4000-8000-00000000000b";
const HOFFMANN = "00000000-0000-4000-8000-00000000000a";

function workspace(companyId: string, name: string, overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    companyId,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    status: "active",
    roleName: "Admin",
    isAdmin: true,
    isCurrent: false,
    activeMemberCount: 1,
    subscription: null,
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const navigateDocument = vi.fn();
let root: Root | undefined;
let container: HTMLDivElement | undefined;

function mount(element: ReactElement, items: WorkspaceSummary[], appMode: "cloud" | "demo" = "cloud") {
  const fakeRoot = {
    appMode,
    localeStore: { locale: "de" },
    loadingOverlayStore: { setIsLoading: vi.fn() },
    navigationGuard: { tryNavigate: vi.fn(), navigateDocument },
    createWorkspaceModalStore: { start: vi.fn() },
  };
  const workspacesStore = new WorkspacesStore(fakeRoot as unknown as RootStore);
  workspacesStore.setWorkspaces(items);
  harness.rootStore = { ...fakeRoot, workspacesStore };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(element));
}

function dialog() {
  return document.querySelector<HTMLElement>("[data-slot='confirm-dialog']");
}

function click(element: Element | null | undefined) {
  expect(element).toBeTruthy();
  act(() => (element as HTMLElement).click());
}

function listRow(companyId: string) {
  return document.querySelector<HTMLElement>(`li[data-workspace-id='${companyId}']`);
}

function listLeave(companyId: string) {
  return listRow(companyId)?.querySelector<HTMLButtonElement>("[data-slot='leave-inactive-workspace']") ?? null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  actions.leaveInactiveWorkspaceAction.mockImplementation(({ companyId }: { companyId: string }) =>
    Promise.resolve({ ok: true, data: { companyId } }),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

describe("leaving a workspace in which the membership is inactive", () => {
  it("lets a member the Free plan paused leave from the paused page, after telling them it is final", async () => {
    mount(createElement(PlanPausedCard, { ownerName: "Anna Bergmann" }), [
      workspace(BERGMANN, "Bergmann Steuern", { isCurrent: true, status: "inactive" }),
      workspace(HOFFMANN, "Hoffmann Consulting"),
    ]);
    expect(dialog()).toBeNull();

    click(document.getElementById("plan-paused-leave"));

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.leaveConfirmTitle:Bergmann Steuern"));
    expect(dialog()?.textContent).toContain("Workspaces.leavePausedConfirmDescription");
    expect(dialog()?.textContent).not.toContain("Workspaces.leaveInactiveConfirmDescription");
    expect(actions.leaveInactiveWorkspaceAction).not.toHaveBeenCalled();

    click(document.getElementById("plan-paused-leave-confirm"));

    await vi.waitFor(() => expect(navigateDocument).toHaveBeenCalledExactlyOnceWith("/de/dashboard"));
    expect(actions.leaveInactiveWorkspaceAction).toHaveBeenCalledExactlyOnceWith({ companyId: BERGMANN });
  });

  it("keeps the paused membership when the person cancels", async () => {
    mount(createElement(PlanPausedCard, { ownerName: null }), [
      workspace(BERGMANN, "Bergmann Steuern", { isCurrent: true, status: "inactive" }),
    ]);

    click(document.getElementById("plan-paused-leave"));
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    click(document.getElementById("plan-paused-leave-confirm-cancel"));

    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(actions.leaveInactiveWorkspaceAction).not.toHaveBeenCalled();
    expect(navigateDocument).not.toHaveBeenCalled();
  });

  it("lets a member an admin deactivated leave from the inactive page", async () => {
    mount(createElement(InactiveCard), [
      workspace(BERGMANN, "Bergmann Steuern", { isCurrent: true, status: "inactive" }),
    ]);

    click(document.getElementById("inactive-leave"));

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.leaveConfirmTitle:Bergmann Steuern"));
    expect(dialog()?.textContent).toContain("Workspaces.leaveInactiveConfirmDescription");

    click(document.getElementById("inactive-leave-confirm"));

    await vi.waitFor(() => expect(navigateDocument).toHaveBeenCalledExactlyOnceWith("/de/dashboard"));
    expect(actions.leaveInactiveWorkspaceAction).toHaveBeenCalledExactlyOnceWith({ companyId: BERGMANN });
  });

  it("offers no leave on these pages while the list does not show an inactive membership", () => {
    mount(createElement(InactiveCard), [workspace(BERGMANN, "Bergmann Steuern", { isCurrent: true })]);
    expect(document.getElementById("inactive-leave")).toBeNull();
    act(() => root?.unmount());

    mount(createElement(PlanPausedCard, { ownerName: null }), []);
    expect(document.getElementById("plan-paused-leave")).toBeNull();
  });

  it("offers Leave in the list for every inactive workspace and for no other one", () => {
    const workspaces = [
      workspace(HOFFMANN, "Hoffmann Consulting", { isCurrent: true }),
      workspace(BERGMANN, "Bergmann Steuern", { status: "inactive", activeMemberCount: null }),
      workspace("pending", "Keller GmbH", { status: "pendingAuthorization", activeMemberCount: null }),
      workspace("active", "Lang und Partner"),
    ];
    mount(createElement(WorkspacesPageView, { leaveRefusal: null, workspaces }), workspaces);

    expect(listLeave(BERGMANN)?.getAttribute("aria-label")).toBe("Workspaces.leaveNamed:Bergmann Steuern");
    expect(listLeave(BERGMANN)?.textContent).toBe("Workspaces.leaveShort");
    expect(listLeave("pending")).toBeNull();
    expect(listLeave("active")).toBeNull();
    expect(listLeave(HOFFMANN)).toBeNull();
    expect(document.getElementById("settings-workspaces-leave")).not.toBeNull();
  });

  it("leaves an inactive workspace from the list of an active one and reloads the list", async () => {
    const workspaces = [
      workspace(HOFFMANN, "Hoffmann Consulting", { isCurrent: true }),
      workspace(BERGMANN, "Bergmann Steuern", { status: "inactive", activeMemberCount: null }),
    ];
    mount(createElement(WorkspacesPageView, { leaveRefusal: null, workspaces }), workspaces);

    click(listLeave(BERGMANN));

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.leaveConfirmTitle:Bergmann Steuern"));
    expect(dialog()?.textContent).toContain("Workspaces.leaveInactiveConfirmDescription");

    click(document.getElementById("settings-workspaces-leave-inactive-confirm"));

    await vi.waitFor(() =>
      expect(navigateDocument).toHaveBeenCalledExactlyOnceWith(`${window.location.pathname}${window.location.search}`),
    );
    expect(actions.leaveInactiveWorkspaceAction).toHaveBeenCalledExactlyOnceWith({ companyId: BERGMANN });
    expect(actions.leaveWorkspaceAction).not.toHaveBeenCalled();
  });

  it("offers no leave for an inactive workspace in the demo", () => {
    const workspaces = [
      workspace(HOFFMANN, "Hoffmann Consulting", { isCurrent: true }),
      workspace(BERGMANN, "Bergmann Steuern", { status: "inactive", activeMemberCount: null }),
    ];
    mount(createElement(WorkspacesPageView, { leaveRefusal: null, workspaces }), workspaces, "demo");

    expect(listLeave(BERGMANN)).toBeNull();
  });
});
