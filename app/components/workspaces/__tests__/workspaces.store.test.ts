import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  leaveWorkspaceAction: vi.fn(),
  listMyWorkspacesAction: vi.fn(),
  switchWorkspaceAction: vi.fn(),
}));
const toastZodErrorTree = vi.hoisted(() => vi.fn());

vi.mock("@/app/[locale]/(protected)/settings/(account)/workspaces/actions", () => actions);
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));

import { WorkspaceTabChannel } from "../workspace-tab-channel";
import { WorkspacesStore } from "../workspaces.store";

function workspace(companyId: string, overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    companyId,
    name: `Workspace ${companyId}`,
    status: "active",
    roleName: "Admin",
    isAdmin: true,
    isCurrent: false,
    activeMemberCount: 1,
    subscription: null,
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function storeFor(appMode: "cloud" | "self-hosted" | "demo" = "cloud") {
  const navigationGuard = {
    tryNavigate: vi.fn((navigate: () => void) => {
      navigate();
      return true;
    }),
    navigateDocument: vi.fn(),
  };
  const loadingOverlayStore = { setIsLoading: vi.fn() };
  const rootStore = { appMode, navigationGuard, loadingOverlayStore, localeStore: { locale: "de" } };
  return { store: new WorkspacesStore(rootStore as unknown as RootStore), navigationGuard, loadingOverlayStore };
}

const disposers: Array<() => void> = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

describe("WorkspacesStore", () => {
  it("exposes the current workspace, the others and creation outside the demo", () => {
    const { store } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b"), workspace("c")]);

    expect(store.current?.companyId).toBe("a");
    expect(store.others.map((item) => item.companyId)).toEqual(["b", "c"]);
    expect(store.canCreate).toBe(true);
    expect(storeFor("self-hosted").store.canCreate).toBe(true);
    expect(storeFor("demo").store.canCreate).toBe(false);
  });

  it("renames only the current workspace", () => {
    const { store } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true, name: null }), workspace("b")]);

    store.renameCurrent("Taxes");

    expect(store.items.map((item) => item.name)).toEqual(["Taxes", "Workspace b"]);
  });

  it("switches through the action, then reloads the localized dashboard and tells the other tabs", async () => {
    const { store, navigationGuard, loadingOverlayStore } = storeFor();
    const other = storeFor().store;
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b", { name: "Taxes" })]);
    other.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b", { name: "Taxes" })]);
    disposers.push(other.connectTabs());
    actions.switchWorkspaceAction.mockResolvedValue({ ok: true, data: { companyId: "b" } });

    await store.switchTo("b");

    expect(actions.switchWorkspaceAction).toHaveBeenCalledWith({ companyId: "b" });
    expect(navigationGuard.navigateDocument).toHaveBeenCalledWith("/de/dashboard");
    expect(loadingOverlayStore.setIsLoading).toHaveBeenLastCalledWith(true);
    expect(store.isNavigating).toBe(true);
    await vi.waitFor(() => expect(other.foreignNotice).toEqual({ companyId: "b", name: "Taxes" }));
  });

  it("stays on the page and reports the refusal when the switch fails", async () => {
    const { store, navigationGuard, loadingOverlayStore } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b")]);
    const error = { errors: ["Common.errors.workspaceNotFound"] };
    actions.switchWorkspaceAction.mockResolvedValue({ ok: false, error });

    await store.switchTo("b");

    expect(toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(navigationGuard.navigateDocument).not.toHaveBeenCalled();
    expect(loadingOverlayStore.setIsLoading).toHaveBeenLastCalledWith(false);
    expect(store.isNavigating).toBe(false);
  });

  it("asks the unsaved-changes guard before switching and never switches to the current workspace", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b")]);
    actions.switchWorkspaceAction.mockResolvedValue({ ok: true, data: { companyId: "b" } });

    store.requestSwitch("a");
    expect(navigationGuard.tryNavigate).not.toHaveBeenCalled();

    store.requestSwitch("b");
    expect(navigationGuard.tryNavigate).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(navigationGuard.navigateDocument).toHaveBeenCalledWith("/de/dashboard"));

    store.requestSwitch("b");
    expect(navigationGuard.tryNavigate).toHaveBeenCalledOnce();
  });

  it("leaves the current workspace and reloads at the localized root", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b")]);
    actions.leaveWorkspaceAction.mockResolvedValue({ ok: true, data: { companyId: "a" } });

    await expect(store.leaveCurrent()).resolves.toBe(true);

    expect(actions.leaveWorkspaceAction).toHaveBeenCalledWith({ companyId: "a" });
    expect(navigationGuard.navigateDocument).toHaveBeenCalledWith("/de");
  });

  it("keeps the person in the workspace when leaving is refused", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true })]);
    const error = { errors: ["Common.errors.workspaceLastAdmin"] };
    actions.leaveWorkspaceAction.mockResolvedValue({ ok: false, error });

    await expect(store.leaveCurrent()).resolves.toBe(false);

    expect(toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(navigationGuard.navigateDocument).not.toHaveBeenCalled();
  });

  it("asks to reload instead of leaving when the session moved to another workspace meanwhile", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true })]);
    const error = { errors: ["Common.errors.workspaceChanged"] };
    actions.leaveWorkspaceAction.mockResolvedValue({ ok: false, error, code: "workspaceChanged" });

    await expect(store.leaveCurrent()).resolves.toBe(false);

    expect(store.foreignNotice).toEqual({ companyId: null, name: null });
    expect(toastZodErrorTree).not.toHaveBeenCalled();
    expect(navigationGuard.navigateDocument).not.toHaveBeenCalled();
  });

  it("blocks only the tabs that still show a different workspace", async () => {
    const switching = storeFor().store;
    const stale = storeFor().store;
    const alreadyThere = storeFor().store;
    switching.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b")]);
    stale.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b")]);
    alreadyThere.setWorkspaces([workspace("a"), workspace("b", { isCurrent: true })]);
    disposers.push(switching.connectTabs(), stale.connectTabs(), alreadyThere.connectTabs());

    switching.enter({ companyId: "b", name: "Workspace b" }, "/dashboard");

    await vi.waitFor(() => expect(stale.foreignNotice).toEqual({ companyId: "b", name: "Workspace b" }));
    expect(switching.foreignNotice).toBeNull();
    expect(alreadyThere.foreignNotice).toBeNull();
  });

  it("refreshes the list, for example with a membership approved in the meantime", async () => {
    const { store } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b", { status: "pendingAuthorization" })]);
    actions.listMyWorkspacesAction.mockResolvedValue({
      ok: true,
      data: [workspace("a", { isCurrent: true }), workspace("b")],
    });

    await store.refresh();

    expect(store.others.map((item) => item.status)).toEqual(["active"]);
    expect(store.foreignNotice).toBeNull();
  });

  it("blocks the page instead of mixing workspaces when fresh data shows another active workspace", async () => {
    const { store } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b", { name: "Taxes" })]);
    actions.listMyWorkspacesAction.mockResolvedValue({
      ok: true,
      data: [workspace("a"), workspace("b", { isCurrent: true, name: "Taxes" })],
    });

    await store.refresh();

    expect(store.current?.companyId).toBe("a");
    expect(store.foreignNotice).toEqual({ companyId: "b", name: "Taxes" });
  });

  it("keeps the shown list and hands a refused refresh to the error display, which asks to reload", async () => {
    const { store } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true })]);
    const error = { errors: ["Common.errors.workspaceChanged"], digest: "CUSTOMERMATES_WORKSPACE_CHANGED" };
    actions.listMyWorkspacesAction.mockResolvedValue({ ok: false, error, code: "workspaceChanged" });

    await store.refresh();

    expect(toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(store.current?.companyId).toBe("a");
  });

  it("blocks the page when the server reports that this session's workspace changed, unless it is already leaving", () => {
    const { store } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true })]);

    store.showWorkspaceChanged();
    expect(store.foreignNotice).toEqual({ companyId: null, name: null });

    store.setForeignNotice(null);
    store.setIsNavigating(true);
    store.showWorkspaceChanged();
    expect(store.foreignNotice).toBeNull();
  });

  it("announces the joined workspace to the other tabs before opening it", async () => {
    const { store, navigationGuard } = storeFor();
    const listener = vi.fn();
    disposers.push(new WorkspaceTabChannel().open(listener));

    store.enter({ companyId: "joined", name: "Bergmann Steuern" }, "/auth/pending");

    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ companyId: "joined", name: "Bergmann Steuern" }));
    expect(navigationGuard.navigateDocument).toHaveBeenCalledWith("/de/auth/pending");
  });

  it("follows the other tab with a full reload of the dashboard", () => {
    const { store, navigationGuard } = storeFor();

    store.followOtherTab();

    expect(navigationGuard.navigateDocument).toHaveBeenCalledWith("/de/dashboard");
    expect(store.isNavigating).toBe(true);
  });
});
