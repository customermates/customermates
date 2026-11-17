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
vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/components/subscription/plan-selection", () => ({
  PlanSelection: () => null,
}));

import { InactiveCard } from "@/app/[locale]/(public)/auth/error/inactive-card";
import { PlanPausedCard } from "@/app/[locale]/(public)/auth/paused/plan-paused-card";
import { WorkspacesPageView } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/components/workspaces-page-view";
import { SubscriptionExpiredView } from "@/app/[locale]/(protected)/w/[workspace]/subscription-expired/components/subscription-expired-view";

import { WorkspacesStore } from "../workspaces.store";

const BERGMANN = "00000000-0000-4000-8000-00000000000b";
const HOFFMANN = "00000000-0000-4000-8000-00000000000a";
const LANG = "00000000-0000-4000-8000-00000000000c";
const KELLER = "00000000-0000-4000-8000-00000000000d";
const HOFFMANN_LEAVE = [{ companyId: HOFFMANN, refusal: null }];
const LOCKED = { status: "unPaid", plan: "pro", trialEndDate: null } as const;

function workspace(companyId: string, name: string, overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    companyId,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    status: "active",
    inactiveReason: null,
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
    loadingOverlayStore: { isLoading: false, setIsLoading: vi.fn() },
    navigationGuard: { tryNavigate: vi.fn(), navigateDocument },
    createWorkspaceModalStore: { start: vi.fn() },
    subscriptionExpiredStore: { checkout: null, activated: false, setCheckout: vi.fn(), refreshCheckout: vi.fn() },
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
      workspace(BERGMANN, "Bergmann Steuern", { isCurrent: true, status: "inactive", inactiveReason: "deactivated" }),
    ]);
    expect(container?.textContent).toContain("InactiveCard.subtitle");
    expect(container?.textContent).toContain("InactiveCard.body");
    expect(container?.textContent).not.toContain("InactiveCard.support");
    expect(document.getElementById("inactive-contact-support")).toBeNull();

    click(document.getElementById("inactive-leave"));

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.leaveConfirmTitle:Bergmann Steuern"));
    expect(dialog()?.textContent).toContain("Workspaces.leaveInactiveConfirmDescription");

    click(document.getElementById("inactive-leave-confirm"));

    await vi.waitFor(() => expect(navigateDocument).toHaveBeenCalledExactlyOnceWith("/de/dashboard"));
    expect(actions.leaveInactiveWorkspaceAction).toHaveBeenCalledExactlyOnceWith({ companyId: BERGMANN });
  });

  it("sends the person to support instead of an administrator when the workspace has no active admin left", async () => {
    mount(createElement(InactiveCard), [
      workspace(BERGMANN, "Bergmann Steuern", { isCurrent: true, status: "inactive", inactiveReason: "noActiveAdmin" }),
    ]);

    expect(container?.textContent).toContain("InactiveCard.supportSubtitle");
    expect(container?.textContent).toContain("InactiveCard.supportBody");
    expect(container?.textContent).not.toContain("InactiveCard.subtitle");
    expect(container?.textContent).not.toContain("InactiveCard.body");
    const support = document.getElementById("inactive-contact-support");
    expect(support?.textContent).toBe("SubscriptionExpiredView.contactSupportCta");
    expect(support?.getAttribute("href")).toMatch(/^mailto:.+\?subject=SubscriptionExpiredView\.supportEmailSubject$/);

    click(document.getElementById("inactive-leave"));

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.leaveNoAdminConfirmDescription"));
    expect(dialog()?.textContent).not.toContain("Workspaces.leaveInactiveConfirmDescription");
  });

  it.each([
    ["pausedByPlan", "Workspaces.leavePausedConfirmDescription"],
    ["deactivated", "Workspaces.leaveInactiveConfirmDescription"],
    ["noActiveAdmin", "Workspaces.leaveNoAdminConfirmDescription"],
  ] as const)("tells a %s membership in the list its own consequence of leaving", async (inactiveReason, text) => {
    const workspaces = [
      workspace(HOFFMANN, "Hoffmann Consulting", { isCurrent: true }),
      workspace(BERGMANN, "Bergmann Steuern", { status: "inactive", activeMemberCount: null, inactiveReason }),
    ];
    mount(createElement(WorkspacesPageView, { leaves: HOFFMANN_LEAVE, workspaces }), workspaces);

    click(listLeave(BERGMANN));

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.leaveConfirmTitle:Bergmann Steuern"));
    const descriptions = [
      "Workspaces.leavePausedConfirmDescription",
      "Workspaces.leaveInactiveConfirmDescription",
      "Workspaces.leaveNoAdminConfirmDescription",
    ];
    for (const description of descriptions)
      expect(dialog()?.textContent?.includes(description)).toBe(description === text);
  });

  it("offers no leave on these pages while the list does not show an inactive membership", () => {
    mount(createElement(InactiveCard), [workspace(BERGMANN, "Bergmann Steuern", { isCurrent: true })]);
    expect(document.getElementById("inactive-leave")).toBeNull();
    act(() => root?.unmount());

    mount(createElement(PlanPausedCard, { ownerName: null }), []);
    expect(document.getElementById("plan-paused-leave")).toBeNull();
  });

  it("offers the leave of an inactive membership in the list for every inactive workspace and for no other one", () => {
    const workspaces = [
      workspace(HOFFMANN, "Hoffmann Consulting", { isCurrent: true }),
      workspace(BERGMANN, "Bergmann Steuern", { status: "inactive", activeMemberCount: null }),
      workspace("pending", "Keller GmbH", { status: "pendingAuthorization", activeMemberCount: null }),
      workspace(LANG, "Lang und Partner"),
    ];
    const leaves = [...HOFFMANN_LEAVE, { companyId: LANG, refusal: null }];
    mount(createElement(WorkspacesPageView, { leaves, workspaces }), workspaces);

    expect(listLeave(BERGMANN)?.getAttribute("aria-label")).toBe("Workspaces.leaveNamed:Bergmann Steuern");
    expect(listLeave(BERGMANN)?.textContent).toBe("Workspaces.leaveShort");
    expect(listLeave("pending")).toBeNull();
    expect(listLeave(LANG)).toBeNull();
    expect(listLeave(HOFFMANN)).toBeNull();
    expect(document.getElementById("settings-workspaces-leave")).not.toBeNull();
    expect(listRow("pending")?.textContent).not.toContain("Workspaces.leaveShort");
  });

  it("offers Leave for every other workspace the server lets an active member leave, and says why it refuses one", () => {
    const workspaces = [
      workspace(HOFFMANN, "Hoffmann Consulting", { isCurrent: true }),
      workspace(LANG, "Lang und Partner", { subscription: LOCKED }),
      workspace(KELLER, "Keller GmbH"),
      workspace("unlisted", "Vogel KG"),
    ];
    const leaves = [
      ...HOFFMANN_LEAVE,
      { companyId: LANG, refusal: null },
      { companyId: KELLER, refusal: "lastAdmin" as const },
    ];
    mount(createElement(WorkspacesPageView, { leaves, workspaces }), workspaces);

    const lang = document.getElementById(`settings-workspaces-leave-${LANG}`) as HTMLButtonElement | null;
    expect(lang?.disabled).toBe(false);
    expect(lang?.getAttribute("aria-label")).toBe("Workspaces.leaveNamed:Lang und Partner");
    expect(lang?.textContent).toBe("Workspaces.leaveShort");

    const keller = document.getElementById(`settings-workspaces-leave-${KELLER}`) as HTMLButtonElement | null;
    expect(keller?.disabled).toBe(true);
    expect(listRow(KELLER)?.querySelector("[data-slot='leave-workspace-reason']")?.textContent).toBe(
      "Common.errors.workspaceLastAdmin",
    );
    expect(listRow(LANG)?.querySelector("[data-slot='leave-workspace-reason']")).toBeNull();

    expect(document.getElementById("settings-workspaces-leave-unlisted")).toBeNull();
    expect(listRow("unlisted")?.textContent).not.toContain("Workspaces.leaveShort");
    expect((document.getElementById("settings-workspaces-leave") as HTMLButtonElement | null)?.disabled).toBe(false);
  });

  it("leaves another active workspace from the list with the warning of a regular leave and reloads the list", async () => {
    const workspaces = [
      workspace(HOFFMANN, "Hoffmann Consulting", { isCurrent: true }),
      workspace(LANG, "Lang und Partner", { subscription: LOCKED }),
    ];
    const leaves = [...HOFFMANN_LEAVE, { companyId: LANG, refusal: null }];
    mount(createElement(WorkspacesPageView, { leaves, workspaces }), workspaces);

    click(document.getElementById(`settings-workspaces-leave-${LANG}`));

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.leaveConfirmTitle:Lang und Partner"));
    expect(dialog()?.textContent).toContain("Workspaces.leaveConfirmDescription");
    expect(actions.leaveInactiveWorkspaceAction).not.toHaveBeenCalled();

    click(document.getElementById("settings-workspaces-leave-confirm"));

    await vi.waitFor(() =>
      expect(navigateDocument).toHaveBeenCalledExactlyOnceWith(`${window.location.pathname}${window.location.search}`),
    );
    expect(actions.leaveInactiveWorkspaceAction).toHaveBeenCalledExactlyOnceWith({ companyId: LANG, status: "active" });
    expect(actions.leaveWorkspaceAction).not.toHaveBeenCalled();
  });

  it("still leaves the current workspace from its own row and opens the dashboard entry", async () => {
    actions.leaveWorkspaceAction.mockResolvedValue({ ok: true, data: { companyId: HOFFMANN } });
    const workspaces = [workspace(HOFFMANN, "Hoffmann Consulting", { isCurrent: true }), workspace(LANG, "Lang")];
    mount(createElement(WorkspacesPageView, { leaves: HOFFMANN_LEAVE, workspaces }), workspaces);

    click(document.getElementById("settings-workspaces-leave"));
    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.leaveConfirmTitle:Hoffmann Consulting"));
    click(document.getElementById("settings-workspaces-leave-confirm"));

    await vi.waitFor(() => expect(navigateDocument).toHaveBeenCalledExactlyOnceWith("/de/dashboard"));
    expect(actions.leaveWorkspaceAction).toHaveBeenCalledExactlyOnceWith({ companyId: HOFFMANN });
  });

  it("leaves an inactive workspace from the list of an active one and reloads the list", async () => {
    const workspaces = [
      workspace(HOFFMANN, "Hoffmann Consulting", { isCurrent: true }),
      workspace(BERGMANN, "Bergmann Steuern", { status: "inactive", activeMemberCount: null }),
    ];
    mount(createElement(WorkspacesPageView, { leaves: HOFFMANN_LEAVE, workspaces }), workspaces);

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
    mount(createElement(WorkspacesPageView, { leaves: HOFFMANN_LEAVE, workspaces }), workspaces, "demo");

    expect(listLeave(BERGMANN)).toBeNull();
    expect(document.getElementById("settings-workspaces-leave")).toBeNull();
  });
});

describe("leaving a workspace whose subscription locked it", () => {
  const locked = [workspace(BERGMANN, "Bergmann Steuern", { isCurrent: true, isAdmin: false, subscription: LOCKED })];

  function lockedPage(leaveRefusal: "lastAdmin" | "platformOperator" | null) {
    return createElement(SubscriptionExpiredView, {
      checkout: "none",
      firstPlan: false,
      leaveRefusal,
      recoveryPath: "administratorRequired",
    });
  }

  function leaveButton() {
    return document.getElementById("subscription-expired-leave") as HTMLButtonElement | null;
  }

  it("lets an active member leave from the locked page with the warning of a regular leave", async () => {
    actions.leaveWorkspaceAction.mockResolvedValue({ ok: true, data: { companyId: BERGMANN } });
    mount(lockedPage(null), locked);
    expect(leaveButton()?.textContent).toBe("Workspaces.leave");
    expect(leaveButton()?.disabled).toBe(false);
    expect(dialog()).toBeNull();

    click(leaveButton());

    await vi.waitFor(() => expect(dialog()?.textContent).toContain("Workspaces.leaveConfirmTitle:Bergmann Steuern"));
    expect(dialog()?.textContent).toContain("Workspaces.leaveConfirmDescription");
    expect(actions.leaveWorkspaceAction).not.toHaveBeenCalled();

    click(document.getElementById("subscription-expired-leave-confirm"));

    await vi.waitFor(() => expect(navigateDocument).toHaveBeenCalledExactlyOnceWith("/de/dashboard"));
    expect(actions.leaveWorkspaceAction).toHaveBeenCalledExactlyOnceWith({ companyId: BERGMANN });
    expect(actions.leaveInactiveWorkspaceAction).not.toHaveBeenCalled();
  });

  it("keeps the membership when the person cancels on the locked page", async () => {
    mount(lockedPage(null), locked);

    click(leaveButton());
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    click(document.getElementById("subscription-expired-leave-confirm-cancel"));

    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(actions.leaveWorkspaceAction).not.toHaveBeenCalled();
  });

  it.each([
    ["lastAdmin", "Common.errors.workspaceLastAdmin"],
    ["platformOperator", "MemberRemoval.blocked.platformOperator"],
  ] as const)("keeps Leave disabled on the locked page and says why for the %s rule", (refusal, reason) => {
    mount(lockedPage(refusal), locked);

    expect(leaveButton()?.disabled).toBe(true);
    expect(document.getElementById("subscription-expired-leave-reason")?.textContent).toBe(reason);
  });

  it("offers no leave on the locked page in the demo", () => {
    mount(lockedPage(null), locked, "demo");

    expect(leaveButton()).toBeNull();
  });
});
