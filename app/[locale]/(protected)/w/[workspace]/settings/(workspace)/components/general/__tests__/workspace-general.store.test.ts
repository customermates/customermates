import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Action, Resource } from "@/generated/prisma";

const renameWorkspaceAction = vi.hoisted(() => vi.fn());
const updateWorkspaceSlugAction = vi.hoisted(() => vi.fn());
const toastZodErrorTree = vi.hoisted(() => vi.fn());

vi.mock("../../../actions", () => ({ renameWorkspaceAction, updateWorkspaceSlugAction }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));

import { WorkspaceGeneralStore } from "../workspace-general.store";

function storeFor(permissions: Array<[Resource, Action]>) {
  const workspacesStore = { renameCurrent: vi.fn(), openWorkspace: vi.fn() };
  const userStore = {
    user: { id: "user-1" },
    can: (resource: Resource, action: Action) =>
      permissions.some(([allowedResource, allowedAction]) => allowedResource === resource && allowedAction === action),
  };
  const rootStore = { workspacesStore, userStore };
  return { store: new WorkspaceGeneralStore(rootStore as unknown as RootStore), workspacesStore };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkspaceGeneralStore", () => {
  it("lets only members who may update the workspace rename it", () => {
    expect(storeFor([[Resource.company, Action.update]]).store.isReadOnly).toBe(false);
    expect(storeFor([[Resource.company, Action.readAll]]).store.isReadOnly).toBe(true);
    expect(storeFor([[Resource.users, Action.update]]).store.canManage).toBe(false);
  });

  it("saves the new name and shows it in the switcher right away", async () => {
    const { store, workspacesStore } = storeFor([[Resource.company, Action.update]]);
    store.onInitOrRefresh({ name: "Acme", slug: "acme" });
    store.onChange("name", "Acme Taxes");
    renameWorkspaceAction.mockResolvedValue({ ok: true, data: { name: "Acme Taxes" } });

    await store.onSubmit();

    expect(renameWorkspaceAction).toHaveBeenCalledWith({ name: "Acme Taxes" });
    expect(workspacesStore.renameCurrent).toHaveBeenCalledWith("Acme Taxes");
    expect(store.savedState).toEqual({ name: "Acme Taxes", slug: "acme" });
    expect(updateWorkspaceSlugAction).not.toHaveBeenCalled();
    expect(workspacesStore.openWorkspace).not.toHaveBeenCalled();
    expect(store.hasUnsavedChanges).toBe(false);
    expect(store.isLoading).toBe(false);
  });

  it("keeps the unsaved name and shows the error when renaming fails", async () => {
    const { store, workspacesStore } = storeFor([[Resource.company, Action.update]]);
    store.onInitOrRefresh({ name: "Acme", slug: "acme" });
    store.onChange("name", "");
    const error = { errors: [], properties: { name: { errors: ["Too small"] } } };
    renameWorkspaceAction.mockResolvedValue({ ok: false, error });

    await store.onSubmit();

    expect(workspacesStore.renameCurrent).not.toHaveBeenCalled();
    expect(store.getError("name")).toEqual(["Too small"]);
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.isLoading).toBe(false);
  });

  it("changes the workspace URL without renaming it and reopens the same settings page under the new URL", async () => {
    const { store, workspacesStore } = storeFor([[Resource.company, Action.update]]);
    store.onInitOrRefresh({ name: "Acme", slug: "acme" });
    store.onChange("slug", "acme-taxes");
    updateWorkspaceSlugAction.mockResolvedValue({ ok: true, data: { slug: "acme-taxes" } });

    await store.onSubmit();

    expect(renameWorkspaceAction).not.toHaveBeenCalled();
    expect(updateWorkspaceSlugAction).toHaveBeenCalledWith({ slug: "acme-taxes" });
    expect(workspacesStore.openWorkspace).toHaveBeenCalledWith("acme-taxes", "/settings/general");
    expect(store.hasUnsavedChanges).toBe(false);
    expect(store.isLoading).toBe(true);
  });

  it("saves a new name first and keeps the unsaved URL with its error when the URL is taken", async () => {
    const { store, workspacesStore } = storeFor([[Resource.company, Action.update]]);
    store.onInitOrRefresh({ name: "Acme", slug: "acme" });
    store.onChange("name", "Acme Taxes");
    store.onChange("slug", "taken");
    renameWorkspaceAction.mockResolvedValue({ ok: true, data: { name: "Acme Taxes" } });
    const error = { errors: [], properties: { slug: { errors: ["Common.errors.workspaceSlugTaken"] } } };
    updateWorkspaceSlugAction.mockResolvedValue({ ok: false, error });

    await store.onSubmit();

    expect(workspacesStore.renameCurrent).toHaveBeenCalledWith("Acme Taxes");
    expect(store.savedState).toEqual({ name: "Acme Taxes", slug: "acme" });
    expect(store.form).toEqual({ name: "Acme Taxes", slug: "taken" });
    expect(store.getError("slug")).toEqual(["Common.errors.workspaceSlugTaken"]);
    expect(workspacesStore.openWorkspace).not.toHaveBeenCalled();
    expect(store.isLoading).toBe(false);
  });

  it("does not try the URL when renaming fails", async () => {
    const { store } = storeFor([[Resource.company, Action.update]]);
    store.onInitOrRefresh({ name: "Acme", slug: "acme" });
    store.onChange("name", "");
    store.onChange("slug", "acme-taxes");
    renameWorkspaceAction.mockResolvedValue({
      ok: false,
      error: { errors: [], properties: { name: { errors: ["x"] } } },
    });

    await store.onSubmit();

    expect(updateWorkspaceSlugAction).not.toHaveBeenCalled();
    expect(store.hasUnsavedChanges).toBe(true);
  });
});
