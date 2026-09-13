import type { ComponentProps, ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RefreshCw, Trash2 } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppModalActions } from "../app-modal";
import type { BaseModalStore } from "@/core/base/base-modal.store";

const testContext = vi.hoisted(() => ({
  isWide: true,
  contentCloseAutoFocus: undefined as ((event: Event) => void) | undefined,
  contentOpenAutoFocus: undefined as (() => void) | undefined,
  useOverlayFocusReturn:
    vi.fn<(open?: boolean, preferredOpener?: HTMLElement | null, fallbackOpener?: HTMLElement | null) => void>(),
  focusReturn: {
    onCloseAutoFocus: vi.fn<(event: Event) => void>(),
    onOpenAutoFocus: vi.fn<() => void>(),
  },
}));

type TestContentProps = {
  children: ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
  onOpenAutoFocus?: () => void;
};

vi.mock("@/hooks/use-media-query", () => ({
  useIsWiderThan: () => testContext.isWide,
}));

vi.mock("@/components/ui/use-overlay-focus-return", () => ({
  useOverlayFocusReturn: (
    open?: boolean,
    preferredOpener?: HTMLElement | null,
    fallbackOpener?: HTMLElement | null,
  ) => {
    testContext.useOverlayFocusReturn(open, preferredOpener, fallbackOpener);
    return testContext.focusReturn;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => createElement("section", { "data-root": "dialog" }, children),
  DialogContent: ({ children, onCloseAutoFocus, onOpenAutoFocus, ...props }: TestContentProps) => {
    testContext.contentCloseAutoFocus = onCloseAutoFocus;
    testContext.contentOpenAutoFocus = onOpenAutoFocus;
    return createElement("div", { ...props, "data-slot": "dialog-content" }, children);
  },
  DialogTitle: ({ children }: { children: ReactNode }) => createElement("h1", null, children),
  DialogDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
}));

vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: ReactNode }) => createElement("section", { "data-root": "drawer" }, children),
  DrawerContent: ({ children, onCloseAutoFocus, onOpenAutoFocus, ...props }: TestContentProps) => {
    testContext.contentCloseAutoFocus = onCloseAutoFocus;
    testContext.contentOpenAutoFocus = onOpenAutoFocus;
    return createElement("div", { ...props, "data-slot": "drawer-content" }, children);
  },
  DrawerTitle: ({ children }: { children: ReactNode }) => createElement("h1", null, children),
  DrawerDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
}));

vi.mock("../unsaved-changes-guard", () => ({
  UnsavedChangesGuard: () => null,
}));

import { AppModal } from "../app-modal";

type TestAppModalProps = Omit<ComponentProps<typeof AppModal>, "children"> & { children?: ReactNode };
const TestAppModal = AppModal as ComponentType<TestAppModalProps>;

function renderModal(actions?: AppModalActions) {
  return renderToStaticMarkup(
    createElement(
      TestAppModal,
      { actions, open: true, title: "Example modal", onClose: vi.fn() },
      createElement("div", { "data-slot": "modal-body" }, "Body"),
    ),
  );
}

function renderConfiguredModal(isWide: boolean) {
  testContext.isWide = isWide;

  return renderToStaticMarkup(
    createElement(
      TestAppModal,
      {
        description: "Example description",
        open: true,
        title: "Example modal",
        onClose: vi.fn(),
      },
      createElement("div", null, "Body"),
    ),
  );
}

function renderFocusModal(props: Partial<TestAppModalProps> = {}) {
  const control = props.store ? { store: props.store } : { open: true, onClose: vi.fn() };
  return renderToStaticMarkup(createElement(TestAppModal, { ...control, ...props, title: "Focus modal" }, "Body"));
}

beforeEach(() => {
  testContext.isWide = true;
  testContext.contentCloseAutoFocus = undefined;
  testContext.contentOpenAutoFocus = undefined;
  testContext.useOverlayFocusReturn.mockReset();
  testContext.focusReturn.onCloseAutoFocus.mockReset();
  testContext.focusReturn.onOpenAutoFocus.mockReset();
});

describe("AppModal actions", () => {
  it.each([
    ["dialog", true],
    ["drawer", false],
  ])("renders one shared action row on the %s surface", (surface, isWide) => {
    testContext.isWide = isWide;
    const html = renderModal([
      { id: "delete", icon: Trash2, label: "Delete", variant: "destructive", onClick: vi.fn() },
    ]);

    expect(html.match(/data-slot="app-modal-actions"/g)).toHaveLength(1);
    expect(html).toContain(`data-root="${surface}"`);
    expect(html).toContain('data-overlay-actions=""');
    expect(html).toContain('data-overlay-action-count="1"');
    expect(html).toContain("top-1.5 right-[3.125rem]");
    expect(html).toContain("min-h-9");
    expect(html).toContain("gap-2");
    expect(html).toContain('data-overlay-action=""');
    expect(html).toContain('data-size="icon"');
    expect(html.indexOf('data-slot="app-modal-actions"')).toBeLessThan(html.indexOf('data-slot="modal-body"'));
  });

  it.each([undefined, []] as const)("omits the action row and marker for empty actions", (actions) => {
    const html = renderModal(actions);

    expect(html).not.toContain('data-slot="app-modal-actions"');
    expect(html).not.toContain("data-overlay-actions");
    expect(html).not.toContain("data-overlay-action-count");
  });

  it.each([
    ["dialog", true],
    ["drawer", false],
  ])("applies shared content classes and descriptions on the %s surface", (surface, isWide) => {
    const html = renderConfiguredModal(isWide);

    expect(html).toContain(`data-root="${surface}"`);
    expect(html).toContain("Example description");
  });

  it.each([
    ["dialog", true],
    ["drawer", false],
  ])("keeps ordered, semantic actions together on the %s surface", (surface, isWide) => {
    testContext.isWide = isWide;
    const html = renderModal([
      { id: "sync", icon: RefreshCw, label: "Sync", onClick: vi.fn() },
      { id: "delete", icon: Trash2, label: "Delete", variant: "destructive", onClick: vi.fn() },
    ]);
    const actionRail = html.match(/<div[^>]*data-slot="app-modal-actions"[^>]*>[\s\S]*?<\/div>/)?.[0];

    expect(actionRail?.match(/<button/g)).toHaveLength(2);
    expect(actionRail?.match(/data-overlay-action=""/g)).toHaveLength(2);
    expect(html.indexOf('aria-label="Sync"')).toBeLessThan(html.indexOf('aria-label="Delete"'));
    expect(actionRail).toContain('data-variant="destructive"');
    expect(html).toContain(`data-root="${surface}"`);
    expect(html).toContain('data-overlay-actions=""');
    expect(html).toContain('data-overlay-action-count="2"');
  });

  it("rejects more actions than the fixed header rail supports", () => {
    expect(() =>
      renderModal([
        { id: "one", icon: RefreshCw, label: "One", onClick: vi.fn() },
        { id: "two", icon: RefreshCw, label: "Two", onClick: vi.fn() },
        { id: "three", icon: RefreshCw, label: "Three", onClick: vi.fn() },
      ] as unknown as AppModalActions),
    ).toThrow("AppModal supports at most two header actions");
  });
});

describe.each([
  ["dialog", true],
  ["drawer", false],
] as const)("AppModal focus return on the %s surface", (_surface, isWide) => {
  beforeEach(() => {
    testContext.isWide = isWide;
  });

  it("runs the caller close callback before normal focus return", () => {
    const calls: string[] = [];
    const onCloseAutoFocus = vi.fn(() => calls.push("caller"));
    testContext.focusReturn.onCloseAutoFocus.mockImplementation(() => {
      calls.push("focus return");
    });
    renderFocusModal({ onCloseAutoFocus });
    const event = new Event("closeAutoFocus", { cancelable: true });

    testContext.contentCloseAutoFocus?.(event);

    expect(calls).toEqual(["caller", "focus return"]);
    expect(onCloseAutoFocus).toHaveBeenCalledWith(event);
    expect(testContext.focusReturn.onCloseAutoFocus).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("lets an intentional handoff suppress normal focus return", () => {
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault());
    renderFocusModal({ onCloseAutoFocus });
    const event = new Event("closeAutoFocus", { cancelable: true });

    testContext.contentCloseAutoFocus?.(event);

    expect(onCloseAutoFocus).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(true);
    expect(testContext.focusReturn.onCloseAutoFocus).not.toHaveBeenCalled();
  });

  it("retains default close and open focus handling without a caller callback", () => {
    renderFocusModal();
    const event = new Event("closeAutoFocus", { cancelable: true });

    testContext.contentCloseAutoFocus?.(event);
    testContext.contentOpenAutoFocus?.();

    expect(testContext.focusReturn.onCloseAutoFocus).toHaveBeenCalledWith(event);
    expect(testContext.focusReturn.onOpenAutoFocus).toHaveBeenCalledOnce();
  });

  it.each([true, false])("passes controlled targets and open=%s to the shared focus hook", (open) => {
    const target = { id: "controlled-target" } as HTMLElement;
    const fallback = { id: "controlled-fallback" } as HTMLElement;

    renderFocusModal({ open, focusReturnTarget: target, focusReturnFallback: fallback });

    expect(testContext.useOverlayFocusReturn).toHaveBeenLastCalledWith(open, target, fallback);
  });

  it("prefers the store's focus targets and open state over controlled targets", () => {
    const target = { id: "store-target" } as HTMLElement;
    const fallback = { id: "store-fallback" } as HTMLElement;
    const store = {
      isOpen: false,
      rootStore: { navigationGuard: undefined },
      focusReturnTarget: target,
      focusReturnFallback: fallback,
    } as unknown as BaseModalStore;

    renderFocusModal({
      store,
      focusReturnTarget: { id: "controlled-target" } as HTMLElement,
      focusReturnFallback: { id: "controlled-fallback" } as HTMLElement,
    });

    expect(testContext.useOverlayFocusReturn).toHaveBeenLastCalledWith(false, target, fallback);
  });
});
