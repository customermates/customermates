import type { Root } from "react-dom/client";
import type { ReactNode } from "react";

import { act, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observable, runInAction } from "mobx";

const harness = vi.hoisted(() => {
  const store = {
    add: vi.fn(),
    canManage: false,
    close: vi.fn(),
    customColumns: [{ id: "custom-1" }, { id: "custom-2" }],
    entityLoadState: "ready",
    hasUnsavedChanges: false,
    loadById: vi.fn(),
    resetForm: vi.fn(),
    withUnsavedChangesGuard: false,
  };
  const rootStore = {
    userStore: {
      canAccess: () => true,
      user: { id: "user-1" },
    },
  };

  return {
    getP13nAction: vi.fn(),
    personalization: vi.fn(() => ({ p13nId: "contact-detail", defaultStarredFieldIds: [] })),
    popTop: vi.fn(),
    reportApplicationError: vi.fn(),
    rootStore,
    store,
  };
});

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/app/actions", () => ({ getP13nAction: harness.getP13nAction }));
vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  focusEntityDrawerInvoker: () => false,
  useEntityDrawerStack: () => ({
    popTop: harness.popTop,
    top: { entityType: "contact", id: "contact-1" },
  }),
}));
vi.mock("@/components/entity-detail/entity-detail.registry", () => ({
  ENTITY_DETAIL: {
    contact: {
      DetailView: ({ layout }: { layout: string }) =>
        createElement("div", { "data-detail-view": true, "data-layout": layout }),
      personalization: harness.personalization,
      store: () => harness.store,
    },
  },
}));
vi.mock("@/components/entity-detail/entity-detail-personalization", () => ({
  EntityDetailPersonalizationProvider: ({
    children,
    config,
    customColumnIds,
    initial,
    persistenceScope,
  }: {
    children: ReactNode;
    config?: { p13nId: string };
    customColumnIds?: string[];
    initial?: { columnOrder?: string[] } | null;
    persistenceScope: string;
  }) =>
    createElement(
      "div",
      {
        "data-column-ids": customColumnIds?.join(","),
        "data-initial-order": initial?.columnOrder?.join(","),
        "data-p13n-id": config?.p13nId,
        "data-personalization-provider": true,
        "data-persistence-scope": persistenceScope,
      },
      children,
    ),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => harness.rootStore,
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: () => "Contact" }),
}));
vi.mock("@/components/ui/use-overlay-focus-return", () => ({
  useOverlayFocusReturn: () => ({ onCloseAutoFocus: vi.fn() }),
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SheetBody: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SheetContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SheetTitle: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("radix-ui", () => ({
  VisuallyHidden: { Root: ({ children }: { children: ReactNode }) => createElement("div", null, children) },
}));
vi.mock("@/components/modal/unsaved-changes-guard", () => ({ UnsavedChangesGuard: () => null }));
vi.mock("@/components/page-state/page-state", () => ({
  PageState: ({ background }: { background?: ReactNode }) => createElement("div", null, background),
}));
vi.mock("@/components/entity-detail/entity-detail-page-skeleton", () => ({
  EntityDetailDrawerSkeleton: () => createElement("div", { "data-drawer-skeleton": true }),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: ReactNode }) => createElement("button", null, children),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: harness.reportApplicationError,
  runUserAction: (action: () => unknown) => action(),
}));

import { EntityDrawer } from "../entity-drawer";

const roots = new Set<Root>();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.store.entityLoadState = "ready";
  harness.store.loadById.mockResolvedValue(undefined);
  harness.rootStore.userStore.user = observable({ id: "user-1" });
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
});

describe("EntityDrawer personalization", () => {
  it("waits for the user preference and provides its custom-field order to drawer details", async () => {
    let resolvePreference: ((value: { ok: true; data: { p13nId: string; columnOrder: string[] } }) => void) | undefined;
    harness.getP13nAction.mockReturnValue(
      new Promise((resolve) => {
        resolvePreference = resolve;
      }),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.add(root);

    await act(async () => {
      root.render(createElement(EntityDrawer));
      await Promise.resolve();
    });

    expect(harness.store.loadById).toHaveBeenCalledWith("contact-1");
    expect(harness.getP13nAction).toHaveBeenCalledWith({ p13nId: "contact-detail" });
    expect(container.querySelector("[data-drawer-skeleton]")).not.toBeNull();
    expect(container.querySelector("[data-detail-view]")).toBeNull();

    await act(async () => {
      resolvePreference?.({
        ok: true,
        data: { p13nId: "contact-detail", columnOrder: ["custom-2", "custom-1"] },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const provider = container.querySelector<HTMLElement>("[data-personalization-provider]");

    expect(provider?.dataset.p13nId).toBe("contact-detail");
    expect(provider?.dataset.persistenceScope).toBe("user-1");
    expect(provider?.dataset.columnIds).toBe("custom-1,custom-2");
    expect(provider?.dataset.initialOrder).toBe("custom-2,custom-1");
    expect(container.querySelector('[data-detail-view][data-layout="drawer"]')).not.toBeNull();
  });

  it("restarts the load after Strict Mode replays the mount effect", async () => {
    harness.getP13nAction.mockResolvedValue({
      ok: true,
      data: { p13nId: "contact-detail", columnOrder: ["custom-2", "custom-1"] },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.add(root);

    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(EntityDrawer)));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(harness.store.loadById).toHaveBeenCalledTimes(2);
    expect(harness.getP13nAction).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-detail-view][data-layout="drawer"]')).not.toBeNull();
  });

  it("falls back to source order when the optional preference read fails", async () => {
    const error = new Error("unavailable");
    harness.getP13nAction.mockRejectedValue(error);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.add(root);

    await act(async () => {
      root.render(createElement(EntityDrawer));
      await Promise.resolve();
      await Promise.resolve();
    });

    const provider = container.querySelector<HTMLElement>("[data-personalization-provider]");

    expect(provider?.dataset.initialOrder).toBeUndefined();
    expect(container.querySelector('[data-detail-view][data-layout="drawer"]')).not.toBeNull();
    expect(harness.reportApplicationError).toHaveBeenCalledWith(error);
  });

  it("cannot apply a late preference response after the active user changes", async () => {
    let resolveFirst: ((value: { ok: true; data: { p13nId: string; columnOrder: string[] } }) => void) | undefined;
    let resolveSecond: ((value: { ok: true; data: { p13nId: string; columnOrder: string[] } }) => void) | undefined;
    harness.getP13nAction
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.add(root);

    await act(async () => {
      root.render(createElement(EntityDrawer));
      await Promise.resolve();
    });

    await act(async () => {
      runInAction(() => {
        harness.rootStore.userStore.user.id = "user-2";
      });
      await Promise.resolve();
    });

    await act(async () => {
      resolveSecond?.({
        ok: true,
        data: { p13nId: "contact-detail", columnOrder: ["custom-2", "custom-1"] },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLElement>("[data-personalization-provider]")?.dataset.persistenceScope).toBe(
      "user-2",
    );
    expect(container.querySelector<HTMLElement>("[data-personalization-provider]")?.dataset.initialOrder).toBe(
      "custom-2,custom-1",
    );

    await act(async () => {
      resolveFirst?.({
        ok: true,
        data: { p13nId: "contact-detail", columnOrder: ["custom-1", "custom-2"] },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLElement>("[data-personalization-provider]")?.dataset.persistenceScope).toBe(
      "user-2",
    );
    expect(container.querySelector<HTMLElement>("[data-personalization-provider]")?.dataset.initialOrder).toBe(
      "custom-2,custom-1",
    );
  });
});
