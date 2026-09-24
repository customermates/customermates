import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => true }));

import { ResponsiveOverlay } from "../responsive-overlay";

type TestResponsiveOverlayProps = Omit<ComponentProps<typeof ResponsiveOverlay>, "children"> & { children?: ReactNode };
const TestResponsiveOverlay = ResponsiveOverlay as ComponentType<TestResponsiveOverlayProps>;

let container: HTMLDivElement;
let reactRoot: Root;

function renderOverlay(onOpenChange: (open: boolean) => void) {
  act(() => {
    reactRoot.render(
      createElement(
        "div",
        null,
        createElement(
          TestResponsiveOverlay,
          {
            open: true,
            title: "Display options",
            trigger: createElement("button", { id: "contacts-display-options", type: "button" }, "Display options"),
            onOpenChange,
          },
          createElement("button", { id: "contacts-layout-board", type: "button" }, "Board"),
        ),
        createElement(
          "div",
          { "data-agent-surface": "", id: "agent-panel-dialog" },
          createElement("textarea", { "aria-label": "Ask", id: "agent-composer" }),
        ),
        createElement("button", { id: "page-button", type: "button" }, "Page"),
      ),
    );
  });
}

async function settleOutsideListeners() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function press(id: string) {
  act(() => {
    document
      .getElementById(id)
      ?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
});

describe("ResponsiveOverlay beside an assistant surface", () => {
  it("keeps the popover open while the assistant panel is pressed and focused", async () => {
    const onOpenChange = vi.fn();
    renderOverlay(onOpenChange);
    await settleOutsideListeners();

    press("agent-composer");
    act(() => document.getElementById("agent-composer")?.focus());

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.getElementById("contacts-layout-board")).not.toBeNull();
  });

  it("still closes the popover on an outside press that is not on an assistant surface", async () => {
    const onOpenChange = vi.fn();
    renderOverlay(onOpenChange);
    await settleOutsideListeners();

    press("page-button");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
