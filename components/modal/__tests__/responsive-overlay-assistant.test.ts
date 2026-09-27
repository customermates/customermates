import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ isWide: true }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => testContext.isWide }));

import { ResponsiveOverlay } from "../responsive-overlay";
import { assistantSurfaceProps, claimEscapeForAssistant } from "../assistant-surface";

type TestResponsiveOverlayProps = Omit<ComponentProps<typeof ResponsiveOverlay>, "children"> & { children?: ReactNode };
const TestResponsiveOverlay = ResponsiveOverlay as ComponentType<TestResponsiveOverlayProps>;

const SURFACES = [
  ["popover", true],
  ["drawer", false],
] as const;

let container: HTMLDivElement;
let reactRoot: Root;

function renderOverlay(
  onOpenChange: (open: boolean) => void,
  open = true,
  onEscapeKeyDown?: (event: KeyboardEvent) => void,
) {
  act(() => {
    reactRoot.render(
      createElement(
        "div",
        null,
        createElement(
          "div",
          { ...assistantSurfaceProps(), id: "agent-panel-dialog" },
          createElement("textarea", { "aria-label": "Ask", id: "agent-composer" }),
        ),
        createElement(
          TestResponsiveOverlay,
          {
            open,
            title: "Display options",
            trigger: createElement("button", { id: "contacts-display-options", type: "button" }, "Display options"),
            onEscapeKeyDown,
            onOpenChange,
          },
          createElement("button", { id: "contacts-layout-board", type: "button" }, "Board"),
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

function pressEscape(id: string) {
  const target = document.getElementById(id);
  if (!target) throw new Error(`Missing #${id}`);
  act(() => target.focus());
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
  });
}

function overlayContent(surface: "popover" | "drawer") {
  return document.querySelector<HTMLElement>(`[data-slot="${surface}-content"]`);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  testContext.isWide = true;
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  document.body.style.pointerEvents = "";
});

describe.each(SURFACES)("ResponsiveOverlay %s", (surface, isWide) => {
  beforeEach(() => {
    testContext.isWide = isWide;
  });

  it("keeps the overlay open while the assistant panel is pressed and focused", async () => {
    const onOpenChange = vi.fn();
    renderOverlay(onOpenChange);
    await settleOutsideListeners();
    const composer = document.getElementById("agent-composer");

    press("agent-composer");
    act(() => composer?.focus());

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(composer);
    expect(document.getElementById("contacts-layout-board")).not.toBeNull();
  });

  it("still closes on an outside press that is not on an assistant surface", async () => {
    const onOpenChange = vi.fn();
    renderOverlay(onOpenChange);
    await settleOutsideListeners();

    press("page-button");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("moves keyboard focus into the overlay when it opens, so Tab reaches its controls", async () => {
    const onOpenChange = vi.fn();
    renderOverlay(onOpenChange, false);
    act(() => document.getElementById("contacts-display-options")?.focus());

    renderOverlay(onOpenChange, true);
    await settleOutsideListeners();
    const content = overlayContent(surface);

    expect(document.activeElement).toBe(content);
    expect(content?.contains(document.getElementById("contacts-layout-board"))).toBe(true);

    act(() => document.getElementById("contacts-layout-board")?.focus());

    expect(document.activeElement).toBe(document.getElementById("contacts-layout-board"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("leaves Escape pressed in the assistant panel to the assistant and still closes on its own Escape", async () => {
    const onOpenChange = vi.fn();
    const onEscapeKeyDown = vi.fn();
    const assistantEscape = vi.fn();
    const onAssistantKeyDown = (event: KeyboardEvent) => {
      if (claimEscapeForAssistant(event)) assistantEscape();
    };
    renderOverlay(onOpenChange, true, onEscapeKeyDown);
    await settleOutsideListeners();
    document.addEventListener("keydown", onAssistantKeyDown);
    try {
      pressEscape("agent-composer");

      expect(assistantEscape).toHaveBeenCalledOnce();
      expect(onEscapeKeyDown).not.toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalled();

      pressEscape("contacts-layout-board");

      expect(onEscapeKeyDown).toHaveBeenCalledOnce();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(assistantEscape).toHaveBeenCalledOnce();
    } finally {
      document.removeEventListener("keydown", onAssistantKeyDown);
    }
  });

  it("points at no missing description", async () => {
    renderOverlay(vi.fn());
    await settleOutsideListeners();

    expect(overlayContent(surface)?.hasAttribute("aria-describedby")).toBe(false);
  });
});
