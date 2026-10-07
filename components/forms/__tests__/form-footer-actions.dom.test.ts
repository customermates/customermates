import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { BaseFormStore } from "@/core/base/base-form.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ tryNavigate: vi.fn((navigate: () => void) => navigate()) }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ navigationGuard: { tryNavigate: harness.tryNavigate } }),
}));
vi.mock("@/components/modal/use-navigation-guard", () => ({ useNavigationGuard: vi.fn() }));

import { AppForm } from "../form-context";
import { FormFooterActions } from "../form-footer-actions";
import { AppModalCloseContext } from "@/components/modal/app-modal-close-context";
import { OverlayDismissGuardContext, type OverlayDismissGuard } from "@/components/modal/overlay-dismiss-guard";

type FakeStore = {
  hasUnsavedChanges: boolean;
  isLoading: boolean;
  canManage: boolean;
  isReadOnly: boolean;
  withUnsavedChangesGuard: boolean;
  error: unknown;
  resetForm: () => void;
  onSubmit: () => Promise<void>;
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function fakeStore(overrides: Partial<FakeStore> = {}) {
  return observable(
    {
      hasUnsavedChanges: false,
      isLoading: false,
      canManage: true,
      isReadOnly: false,
      withUnsavedChangesGuard: true,
      error: undefined,
      resetForm: vi.fn(),
      onSubmit: vi.fn(() => Promise.resolve()),
      ...overrides,
    },
    { resetForm: false, onSubmit: false },
  ) as FakeStore;
}

function markDirty(store: FakeStore) {
  act(() => {
    runInAction(() => {
      store.hasUnsavedChanges = true;
    });
  });
}

function render(node: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

function inForm(store: FakeStore, footer: ReactNode, modalClose?: () => void) {
  const form = createElement(
    AppForm,
    { store: store as unknown as BaseFormStore, id: "test-form" } as Parameters<typeof AppForm>[0],
    createElement("input", { id: "test-input" }),
    footer,
  );
  return modalClose
    ? createElement(
        AppModalCloseContext.Provider,
        { value: { requestClose: modalClose, guardsUnsavedChanges: true } },
        form,
      )
    : form;
}

function button(id: string) {
  return document.getElementById(id) as HTMLButtonElement | null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.tryNavigate.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = "";
});

describe("FormFooterActions (design rule 31)", () => {
  it("renders no footer for a read-only form", () => {
    const store = fakeStore({ isReadOnly: true, hasUnsavedChanges: true });
    const host = render(inForm(store, createElement(FormFooterActions, { anchorScope: "f" })));
    expect(host.querySelector("[data-slot='form-footer-actions']")).toBeNull();
  });

  it("keeps Save visible but disabled until something changed, with Cancel and no Reset in an overlay", () => {
    const store = fakeStore();
    render(inForm(store, createElement(FormFooterActions, { anchorScope: "f" }), vi.fn()));
    expect(button("f-save")?.disabled).toBe(true);
    expect(button("f-save")?.textContent).toBe("Common.actions.save");
    expect(button("f-cancel")).not.toBeNull();
    expect(button("f-reset")).toBeNull();
    markDirty(store);
    expect(button("f-save")?.disabled).toBe(false);
    expect(button("f-reset")).toBeNull();
  });

  it("disables Save with a busy state while saving", () => {
    const store = fakeStore({ hasUnsavedChanges: true, isLoading: true });
    render(inForm(store, createElement(FormFooterActions, { anchorScope: "f" }), vi.fn()));
    expect(button("f-save")?.disabled).toBe(true);
    expect(button("f-save")?.getAttribute("aria-busy")).toBe("true");
  });

  it("offers Reset on a page form only while it differs from the saved state", () => {
    const store = fakeStore();
    render(inForm(store, createElement(FormFooterActions, { anchorScope: "f" })));
    expect(button("f-reset")).toBeNull();
    expect(button("f-cancel")).toBeNull();
    markDirty(store);
    act(() => button("f-reset")?.click());
    expect(store.resetForm).toHaveBeenCalledOnce();
  });

  it("delegates Cancel to the overlay's guarded close", () => {
    const store = fakeStore({ hasUnsavedChanges: true });
    const close = vi.fn();
    render(inForm(store, createElement(FormFooterActions, { anchorScope: "f" }), close));
    act(() => button("f-cancel")?.click());
    expect(close).toHaveBeenCalledOnce();
    expect(harness.tryNavigate).not.toHaveBeenCalled();
  });

  it("routes an explicit Cancel of a store form through the shared navigation guard", () => {
    const store = fakeStore({ hasUnsavedChanges: true });
    const onCancel = vi.fn();
    render(inForm(store, createElement(FormFooterActions, { anchorScope: "f", onCancel })));
    act(() => button("f-cancel")?.click());
    expect(harness.tryNavigate).toHaveBeenCalledExactlyOnceWith(onCancel);
  });

  it("saves with the platform Save shortcut (Ctrl+Enter outside a Mac) only while Save is enabled", async () => {
    const store = fakeStore();
    render(inForm(store, createElement(FormFooterActions, { anchorScope: "f" }), vi.fn()));
    const input = document.getElementById("test-input") as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    });
    expect(store.onSubmit).not.toHaveBeenCalled();
    markDirty(store);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
    });
    expect(store.onSubmit).not.toHaveBeenCalled();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    });
    await vi.waitFor(() => expect(store.onSubmit).toHaveBeenCalledOnce());
  });

  it("asks before discarding a dirty form without a store, on Cancel and when its overlay is dismissed", () => {
    const onCancel = vi.fn();
    const guard: OverlayDismissGuard = { current: null };
    render(
      createElement(
        OverlayDismissGuardContext.Provider,
        { value: guard },
        createElement(
          "div",
          { "data-slot": "popover-content" },
          createElement(FormFooterActions, {
            anchorScope: "f",
            dirty: true,
            onCancel,
            onSave: vi.fn(),
            placement: "overlay",
          }),
        ),
      ),
    );
    act(() => button("f-cancel")?.click());
    expect(onCancel).not.toHaveBeenCalled();
    act(() => button("discard-changes")?.click());
    expect(onCancel).toHaveBeenCalledOnce();

    let keptOpen = false;
    act(() => {
      keptOpen = guard.current?.() ?? false;
    });
    expect(keptOpen).toBe(true);
    expect(button("discard-changes")).not.toBeNull();
  });

  it("leaves dismissing a clean overlay or a self-guarding modal to the overlay", () => {
    const guard: OverlayDismissGuard = { current: null };
    const store = fakeStore({ hasUnsavedChanges: true });
    render(
      createElement(
        OverlayDismissGuardContext.Provider,
        { value: guard },
        createElement(
          AppModalCloseContext.Provider,
          { value: { requestClose: vi.fn(), guardsUnsavedChanges: true } },
          inForm(store, createElement(FormFooterActions, { anchorScope: "f" })),
        ),
      ),
    );
    expect(guard.current?.()).toBe(false);
  });

  it("closes a clean form without a store immediately", () => {
    const onCancel = vi.fn();
    render(createElement(FormFooterActions, { anchorScope: "f", dirty: false, onCancel, onSave: vi.fn() }));
    act(() => button("f-cancel")?.click());
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
