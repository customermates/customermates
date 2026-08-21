import type { MouseEventHandler, ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ rootStore: null as RootStore | null }));
const captureException = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: toastSuccess } }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));
vi.mock("@/components/ui/use-overlay-focus-return", () => ({
  useOverlayFocusReturn: () => ({}),
}));

vi.mock("@/components/card/app-card", () => ({
  AppCard: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/card/app-card-body", () => ({
  AppCardBody: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/card/app-card-footer", () => ({
  AppCardFooter: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/card/app-card-header", () => ({
  AppCardHeader: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  AlertDialogAction: ({
    children,
    onClick,
    id,
    disabled,
  }: {
    children: ReactNode;
    onClick: MouseEventHandler;
    id: string;
    disabled?: boolean;
  }) => createElement("button", { disabled, id, onClick }, children),
  AlertDialogCancel: ({ children, id, disabled }: { children: ReactNode; id: string; disabled?: boolean }) =>
    createElement("button", { disabled, id }, children),
  AlertDialogContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  AlertDialogDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
  AlertDialogTitle: ({ children }: { children: ReactNode }) => createElement("h1", null, children),
}));

import { DeleteConfirmationModal } from "../delete-confirmation-modal";
import { DeleteConfirmationModalStore } from "../delete-confirmation-modal.store";
import { registerApplicationErrorHandler } from "@/core/errors/report-application-error";

let root: ReactRoot | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  captureException.mockClear();
  toastSuccess.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  testContext.rootStore = null;
});

describe("DeleteConfirmationModal submission boundary", () => {
  it("reports a rejected confirmation instead of dropping its promise", async () => {
    const error = new TypeError("Load failed");
    const onSubmit = vi.fn().mockRejectedValue(error);
    testContext.rootStore = {
      deleteConfirmationModalStore: {
        close: vi.fn(),
        form: { message: "Delete it?", title: "Delete" },
        isLoading: false,
        isOpen: true,
        onSubmit,
      },
    } as unknown as RootStore;
    const seen: unknown[] = [];
    const unregister = registerApplicationErrorHandler((reported) => seen.push(reported));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(createElement(DeleteConfirmationModal)));
    act(() => {
      container?.querySelector<HTMLButtonElement>("#confirm-delete")?.click();
    });

    await vi.waitFor(() => expect(seen).toEqual([error]));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
    unregister();
  });

  it("closes and announces only an explicitly successful confirmation", async () => {
    const store = new DeleteConfirmationModalStore({
      localeStore: { getTranslation: (key: string) => key },
      registerModalStore: vi.fn(),
    } as unknown as RootStore);
    store.openWith({
      message: "Delete it?",
      title: "Delete",
      onConfirm: vi.fn().mockResolvedValue(false),
    });

    await store.onSubmit();

    expect(store.isOpen).toBe(true);
    expect(store.isLoading).toBe(false);
    expect(toastSuccess).not.toHaveBeenCalled();

    store.onInitOrRefresh({ onConfirm: vi.fn().mockResolvedValue(true) });
    await store.onSubmit();

    expect(store.isOpen).toBe(false);
    expect(store.isLoading).toBe(false);
    expect(toastSuccess).toHaveBeenCalledExactlyOnceWith("Common.notifications.deleted", {
      action: undefined,
      description: undefined,
    });
  });
});
