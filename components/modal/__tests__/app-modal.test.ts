import type { ComponentProps, ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ isWide: true }));

vi.mock("@/hooks/use-media-query", () => ({
  useIsWiderThan: () => testContext.isWide,
}));

vi.mock("@/components/ui/use-overlay-focus-return", () => ({
  useOverlayFocusReturn: () => ({}),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => createElement("section", { "data-root": "dialog" }, children),
  DialogContent: ({ children, ...props }: { children: ReactNode }) =>
    createElement("div", { ...props, "data-slot": "dialog-content" }, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement("h1", null, children),
}));

vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: ReactNode }) => createElement("section", { "data-root": "drawer" }, children),
  DrawerContent: ({ children, ...props }: { children: ReactNode }) =>
    createElement("div", { ...props, "data-slot": "drawer-content" }, children),
  DrawerTitle: ({ children }: { children: ReactNode }) => createElement("h1", null, children),
}));

vi.mock("../unsaved-changes-guard", () => ({
  UnsavedChangesGuard: () => null,
}));

import { AppModal } from "../app-modal";

type TestAppModalProps = Omit<ComponentProps<typeof AppModal>, "children"> & { children?: ReactNode };
const TestAppModal = AppModal as ComponentType<TestAppModalProps>;

function renderModal(actions?: ReactNode) {
  return renderToStaticMarkup(
    createElement(
      TestAppModal,
      { actions, open: true, title: "Example modal", onClose: vi.fn() },
      createElement("div", { "data-slot": "modal-body" }, "Body"),
    ),
  );
}

beforeEach(() => {
  testContext.isWide = true;
});

describe("AppModal actions", () => {
  it.each([
    ["dialog", true],
    ["drawer", false],
  ])("renders one shared action row on the %s surface", (surface, isWide) => {
    testContext.isWide = isWide;
    const html = renderModal(createElement("button", { type: "button" }, "Delete"));

    expect(html.match(/data-slot="app-modal-actions"/g)).toHaveLength(1);
    expect(html).toContain(`data-root="${surface}"`);
    expect(html).toContain('data-overlay-actions=""');
    expect(html).toContain("top-1.5 right-14");
    expect(html.indexOf('data-slot="app-modal-actions"')).toBeLessThan(html.indexOf('data-slot="modal-body"'));
  });

  it.each([undefined, null, false])("omits the action row and marker for %s actions", (actions) => {
    const html = renderModal(actions);

    expect(html).not.toContain('data-slot="app-modal-actions"');
    expect(html).not.toContain("data-overlay-actions");
  });

  it("keeps multiple drawer actions together in the shared rail", () => {
    testContext.isWide = false;
    const html = renderModal([
      createElement("button", { key: "sync", type: "button" }, "Sync"),
      createElement("button", { key: "delete", type: "button" }, "Delete"),
    ]);
    const actionRail = html.match(/<div[^>]*data-slot="app-modal-actions"[^>]*>[\s\S]*?<\/div>/)?.[0];

    expect(actionRail?.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('data-root="drawer"');
    expect(html).toContain('data-overlay-actions=""');
  });
});
