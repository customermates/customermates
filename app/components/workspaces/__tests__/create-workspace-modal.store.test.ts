import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const createWorkspaceAction = vi.hoisted(() => vi.fn());
const toastZodErrorTree = vi.hoisted(() => vi.fn());

vi.mock("@/app/[locale]/(protected)/settings/(account)/workspaces/actions", () => ({ createWorkspaceAction }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));

import { CreateWorkspaceModalStore } from "../create-workspace-modal.store";

function storeFor(canCreate = true) {
  const workspacesStore = { canCreate, enter: vi.fn() };
  const rootStore = { workspacesStore, userStore: { user: null, can: () => true } };
  return { store: new CreateWorkspaceModalStore(rootStore as unknown as RootStore), workspacesStore };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateWorkspaceModalStore", () => {
  it("opens with an empty form and stays closed where workspaces cannot be created", () => {
    const { store } = storeFor();
    store.onChange("name", "Leftover");
    store.start();

    expect(store.isOpen).toBe(true);
    expect(store.form).toEqual({ name: "", agreeToTerms: false });

    const demo = storeFor(false).store;
    demo.start();
    expect(demo.isOpen).toBe(false);
  });

  it("creates the workspace and enters it through a full reload of the root", async () => {
    const { store, workspacesStore } = storeFor();
    store.start();
    store.onChange("name", "  Taxes ");
    store.onChange("agreeToTerms", true);
    createWorkspaceAction.mockResolvedValue({ ok: true, data: { companyId: "company-new", trial: false } });

    await store.onSubmit();

    expect(createWorkspaceAction).toHaveBeenCalledWith({ name: "  Taxes ", agreeToTerms: true });
    expect(workspacesStore.enter).toHaveBeenCalledWith({ companyId: "company-new", name: "Taxes" }, "/");
    expect(store.isLoading).toBe(true);

    store.close();
    expect(store.isOpen).toBe(true);
  });

  it("shows the validation errors and lets the person correct them", async () => {
    const { store, workspacesStore } = storeFor();
    store.start();
    const error = { errors: [], properties: { agreeToTerms: { errors: ["Common.errors.termsNotAgreed"] } } };
    createWorkspaceAction.mockResolvedValue({ ok: false, error });

    await store.onSubmit();

    expect(workspacesStore.enter).not.toHaveBeenCalled();
    expect(store.error).toEqual(error);
    expect(store.getError("agreeToTerms")).toEqual(["Common.errors.termsNotAgreed"]);
    expect(store.isLoading).toBe(false);

    store.close();
    expect(store.isOpen).toBe(false);
  });
});
