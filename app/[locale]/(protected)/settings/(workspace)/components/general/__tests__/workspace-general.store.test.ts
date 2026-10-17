import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Action, Resource } from "@/generated/prisma";

const renameWorkspaceAction = vi.hoisted(() => vi.fn());
const toastZodErrorTree = vi.hoisted(() => vi.fn());

vi.mock("../../../actions", () => ({ renameWorkspaceAction }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));

import { WorkspaceGeneralStore } from "../workspace-general.store";

function storeFor(permissions: Array<[Resource, Action]>) {
  const workspacesStore = { renameCurrent: vi.fn() };
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
    store.onInitOrRefresh({ name: "Acme" });
    store.onChange("name", "Acme Taxes");
    renameWorkspaceAction.mockResolvedValue({ ok: true, data: { name: "Acme Taxes" } });

    await store.onSubmit();

    expect(renameWorkspaceAction).toHaveBeenCalledWith({ name: "Acme Taxes" });
    expect(workspacesStore.renameCurrent).toHaveBeenCalledWith("Acme Taxes");
    expect(store.savedState).toEqual({ name: "Acme Taxes" });
    expect(store.hasUnsavedChanges).toBe(false);
    expect(store.isLoading).toBe(false);
  });

  it("keeps the unsaved name and shows the error when renaming fails", async () => {
    const { store, workspacesStore } = storeFor([[Resource.company, Action.update]]);
    store.onInitOrRefresh({ name: "Acme" });
    store.onChange("name", "");
    const error = { errors: [], properties: { name: { errors: ["Too small"] } } };
    renameWorkspaceAction.mockResolvedValue({ ok: false, error });

    await store.onSubmit();

    expect(workspacesStore.renameCurrent).not.toHaveBeenCalled();
    expect(store.getError("name")).toEqual(["Too small"]);
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.isLoading).toBe(false);
  });
});
