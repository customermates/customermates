import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  deleteWorkspaceAction: vi.fn(),
  leaveWorkspaceAction: vi.fn(),
  listMyWorkspacesAction: vi.fn(),
  withdrawWorkspaceRequestAction: vi.fn(),
}));
const toastZodErrorTree = vi.hoisted(() => vi.fn());

vi.mock("@/app/[locale]/(protected)/w/[workspace]/settings/(account)/workspaces/actions", () => actions);
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));

import { WorkspacesStore } from "../workspaces.store";

function workspace(companyId: string, overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    companyId,
    name: `Workspace ${companyId}`,
    slug: `workspace-${companyId}`,
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

beforeEach(() => {
  vi.clearAllMocks();
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

  it("takes whatever list the page sends, because each tab shows the workspace of its own URL", () => {
    const { store } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b")]);

    store.setWorkspaces([workspace("a"), workspace("b", { isCurrent: true })]);

    expect(store.current?.companyId).toBe("b");
    expect(store.unavailable).toBe(false);
  });

  it("renames only the current workspace", () => {
    const { store } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true, name: null }), workspace("b")]);

    store.renameCurrent("Taxes");

    expect(store.items.map((item) => item.name)).toEqual(["Taxes", "Workspace b"]);
  });

  it("switches by loading the other workspace's dashboard in this tab, without a server call", () => {
    const { store, navigationGuard, loadingOverlayStore } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b")]);

    store.requestSwitch("b");

    expect(navigationGuard.tryNavigate).toHaveBeenCalledOnce();
    expect(navigationGuard.navigateDocument).toHaveBeenCalledExactlyOnceWith("/de/w/workspace-b/dashboard");
    expect(loadingOverlayStore.setIsLoading).toHaveBeenCalledWith(true);
    expect(store.isNavigating).toBe(true);

    store.requestSwitch("a");
    expect(navigationGuard.navigateDocument).toHaveBeenCalledOnce();
  });

  it("ignores switching to the workspace already shown or to one it does not list", () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true })]);

    store.requestSwitch("a");
    store.requestSwitch("missing");

    expect(navigationGuard.tryNavigate).not.toHaveBeenCalled();
    expect(navigationGuard.navigateDocument).not.toHaveBeenCalled();
  });

  it("asks to discard unsaved changes before switching and stays when the person keeps them", () => {
    const { store, navigationGuard } = storeFor();
    navigationGuard.tryNavigate.mockImplementation(() => false);
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b")]);

    store.requestSwitch("b");

    expect(navigationGuard.tryNavigate).toHaveBeenCalledOnce();
    expect(navigationGuard.navigateDocument).not.toHaveBeenCalled();
    expect(store.isNavigating).toBe(false);
  });

  it("opens any path of a workspace under its URL", () => {
    const { store, navigationGuard } = storeFor();

    store.openWorkspace("taxes", "/settings/general");

    expect(navigationGuard.navigateDocument).toHaveBeenCalledWith("/de/w/taxes/settings/general");
  });

  it("refreshes the list from the server and shows a failure", async () => {
    const { store } = storeFor();
    actions.listMyWorkspacesAction.mockResolvedValueOnce({ ok: true, data: [workspace("a", { isCurrent: true })] });

    await store.refresh();
    expect(store.current?.companyId).toBe("a");

    const error = { errors: ["Common.errors.unexpected"] };
    actions.listMyWorkspacesAction.mockResolvedValueOnce({ ok: false, error });
    await store.refresh();
    expect(toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(store.current?.companyId).toBe("a");
  });

  it("leaves the current workspace and opens the generic dashboard entry", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b")]);
    actions.leaveWorkspaceAction.mockResolvedValue({ ok: true, data: { companyId: "a" } });

    await expect(store.leaveCurrent()).resolves.toBe(true);

    expect(actions.leaveWorkspaceAction).toHaveBeenCalledWith({ companyId: "a" });
    expect(navigationGuard.navigateDocument).toHaveBeenCalledWith("/de/dashboard");
  });

  it("keeps the person in the workspace when leaving is refused", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true })]);
    const error = { errors: ["Common.errors.workspaceLastAdmin"] };
    actions.leaveWorkspaceAction.mockResolvedValue({ ok: false, error });

    await expect(store.leaveCurrent()).resolves.toBe(false);

    expect(toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(navigationGuard.navigateDocument).not.toHaveBeenCalled();
    expect(store.unavailable).toBe(false);
  });

  it("explains the workspace is unavailable instead of leaving when it is gone already", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true })]);
    const error = { errors: ["Common.errors.workspaceChanged"] };
    actions.leaveWorkspaceAction.mockResolvedValue({ ok: false, error, code: "workspaceChanged" });

    await expect(store.leaveCurrent()).resolves.toBe(false);

    expect(store.unavailable).toBe(true);
    expect(toastZodErrorTree).not.toHaveBeenCalled();
    expect(navigationGuard.navigateDocument).not.toHaveBeenCalled();
  });

  it("deletes the current workspace once and opens the generic dashboard entry", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true }), workspace("b")]);
    actions.deleteWorkspaceAction.mockResolvedValue({ ok: true, data: { companyId: "a", nextCompanyId: "b" } });

    await expect(store.deleteCurrent()).resolves.toBe(true);

    expect(actions.deleteWorkspaceAction).toHaveBeenCalledWith({ companyId: "a" });
    expect(navigationGuard.navigateDocument).toHaveBeenCalledWith("/de/dashboard");
    await expect(store.deleteCurrent()).resolves.toBe(false);
    expect(actions.deleteWorkspaceAction).toHaveBeenCalledTimes(1);
  });

  it("keeps the workspace and shows the reason when deleting is refused", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true })]);
    const error = { errors: ["Common.errors.workspaceDeleteBillingActive"] };
    actions.deleteWorkspaceAction.mockResolvedValue({ ok: false, error, code: "workspaceDeleteBillingActive" });

    await expect(store.deleteCurrent()).resolves.toBe(false);

    expect(toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(navigationGuard.navigateDocument).not.toHaveBeenCalled();
  });

  it("explains the workspace is unavailable when another tab already deleted it", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true })]);
    const error = { errors: ["Common.errors.workspaceChanged"] };
    actions.deleteWorkspaceAction.mockResolvedValue({ ok: false, error, code: "workspaceChanged" });

    await expect(store.deleteCurrent()).resolves.toBe(false);

    expect(store.unavailable).toBe(true);
    expect(toastZodErrorTree).not.toHaveBeenCalled();
    expect(navigationGuard.navigateDocument).not.toHaveBeenCalled();
  });

  it("withdraws a pending request and opens the generic dashboard entry", async () => {
    const { store, navigationGuard } = storeFor();
    store.setWorkspaces([workspace("a", { isCurrent: true, status: "pendingAuthorization" })]);
    actions.withdrawWorkspaceRequestAction.mockResolvedValue({ ok: true, data: { companyId: "a" } });

    await expect(store.withdrawCurrentRequest()).resolves.toBe(true);

    expect(actions.withdrawWorkspaceRequestAction).toHaveBeenCalledWith({ companyId: "a" });
    expect(navigationGuard.navigateDocument).toHaveBeenCalledWith("/de/dashboard");
  });

  it("leaves an unavailable workspace through the generic dashboard entry", () => {
    const { store, navigationGuard } = storeFor();
    store.showUnavailable();
    expect(store.unavailable).toBe(true);

    store.leaveUnavailable();

    expect(navigationGuard.navigateDocument).toHaveBeenCalledWith("/de/dashboard");
    expect(store.isNavigating).toBe(true);
  });

  it("stays quiet about an unavailable workspace while this tab is already navigating away", () => {
    const { store } = storeFor();
    store.setIsNavigating(true);

    store.showUnavailable();

    expect(store.unavailable).toBe(false);
  });
});
