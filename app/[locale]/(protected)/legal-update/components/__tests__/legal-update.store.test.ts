import type { RootStore } from "@/core/stores/root.store";

import { beforeEach, describe, expect, it, vi } from "vitest";

const legalActions = vi.hoisted(() => ({
  acceptLegalDocumentsAction: vi.fn(),
}));
const authActions = vi.hoisted(() => ({ signOutAction: vi.fn() }));
const toasts = vi.hoisted(() => ({ toastZodErrorTree: vi.fn() }));

vi.mock("@/app/[locale]/(protected)/legal-update/actions", () => legalActions);
vi.mock("@/app/[locale]/actions", () => authActions);
vi.mock("@/core/utils/toast-zod-error-tree", () => toasts);

import { LoadingOverlayStore } from "@/components/shared/loading-overlay.store";
import { LegalUpdateStore } from "../legal-update.store";

function setup() {
  const loadingOverlayStore = new LoadingOverlayStore();
  const rootStore = { loadingOverlayStore } as RootStore;
  return { loadingOverlayStore, store: new LegalUpdateStore(rootStore) };
}

describe("LegalUpdateStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resets and owns the explicit acceptance checkbox", () => {
    const { store } = setup();

    store.setChecked(true);
    expect(store.checked).toBe(true);

    store.onInitOrRefresh();
    expect(store.checked).toBe(false);
  });

  it("does not call the acceptance action while unchecked", async () => {
    const { store } = setup();

    await store.accept();

    expect(legalActions.acceptLegalDocumentsAction).not.toHaveBeenCalled();
  });

  it("accepts through the loading overlay with the fixed server-action input", async () => {
    let finish!: (value: { ok: true; data: { agreeToLegalDocuments: true } }) => void;
    legalActions.acceptLegalDocumentsAction.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { loadingOverlayStore, store } = setup();
    store.setChecked(true);

    const pending = store.accept();
    expect(loadingOverlayStore.isLoading).toBe(true);
    expect(legalActions.acceptLegalDocumentsAction).toHaveBeenCalledWith({
      agreeToLegalDocuments: true,
    });

    finish({ ok: true, data: { agreeToLegalDocuments: true } });
    await pending;
    expect(loadingOverlayStore.isLoading).toBe(false);
  });

  it("shows the established validation toast when acceptance fails", async () => {
    const error = { errors: ["acceptance failed"] };
    legalActions.acceptLegalDocumentsAction.mockResolvedValue({
      ok: false,
      error,
    });
    const { store } = setup();
    store.setChecked(true);

    await store.accept();

    expect(toasts.toastZodErrorTree).toHaveBeenCalledWith(error);
  });

  it("signs out through the loading overlay and reports failures", async () => {
    const error = { errors: ["sign-out failed"] };
    authActions.signOutAction.mockResolvedValue({ ok: false, error });
    const { loadingOverlayStore, store } = setup();

    await store.signOut();

    expect(authActions.signOutAction).toHaveBeenCalledOnce();
    expect(toasts.toastZodErrorTree).toHaveBeenCalledWith(error);
    expect(loadingOverlayStore.isLoading).toBe(false);
  });
});
