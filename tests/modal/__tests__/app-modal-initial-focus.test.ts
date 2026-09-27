// @vitest-environment jsdom

import type { AppModalActions } from "@/components/modal/app-modal";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Trash2 } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormFieldHelp } from "@/components/forms/form-field-help";
import { AppModalAction } from "@/components/modal/app-modal-action";
import { TooltipProvider } from "@/components/ui/tooltip";

const surface = vi.hoisted(() => ({ isWide: true }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => surface.isWide }));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));

import { AppModal } from "@/components/modal/app-modal";

type TestAppModalProps = Omit<ComponentProps<typeof AppModal>, "children"> & { children?: ReactNode };
const TestAppModal = AppModal as ComponentType<TestAppModalProps>;

let container: HTMLDivElement;
let reactRoot: Root;

const deleteAction = (disabled = false): AppModalActions => [
  { id: "delete", icon: Trash2, label: "Delete webhook", variant: "destructive", disabled, onClick: vi.fn() },
];

function renderModal(actions: AppModalActions | undefined, body: ReactNode) {
  act(() => {
    reactRoot.render(createElement(TestAppModal, { actions, open: true, title: "Webhook", onClose: vi.fn() }, body));
  });
}

function dialog() {
  const found = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!found) throw new Error("Expected an open dialog");
  return found;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  surface.isWide = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  document.body.replaceChildren();
  document.body.style.pointerEvents = "";
  vi.unstubAllGlobals();
});

describe("AppModal initial focus with a header action rail", () => {
  it.each([
    ["dialog", true],
    ["drawer", false],
  ])("focuses the first form field of the %s instead of the destructive header action", (_surface, isWide) => {
    surface.isWide = isWide;
    renderModal(deleteAction(), createElement("input", { "aria-label": "URL", id: "webhook-modal-url" }));

    expect(document.activeElement?.id).toBe("webhook-modal-url");
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it("focuses the dialog itself while its body has no field, even when the action is disabled", () => {
    renderModal(deleteAction(true), createElement("p", null, "Loading"));

    expect(document.activeElement).toBe(dialog());
  });

  it("keeps the default first-tabbable focus for dialogs without header actions", () => {
    renderModal(undefined, createElement("button", { id: "body-action", type: "button" }, "Body action"));

    expect(document.activeElement?.id).toBe("body-action");
  });

  it("skips a field help tooltip trigger before the first field, so one Escape closes the dialog", () => {
    const onClose = vi.fn();
    act(() => {
      reactRoot.render(
        createElement(
          TestAppModal,
          { actions: deleteAction(), open: true, title: "Custom field", onClose },
          createElement(
            TooltipProvider,
            null,
            createElement(FormFieldHelp, { children: "The type cannot be changed", label: "Explain type" }),
            createElement("input", { "aria-label": "Type", id: "custom-column-type" }),
          ),
        ),
      );
    });

    const focusedId = document.activeElement?.id;
    const tooltipOpenedOnOpen = document.querySelector('[role="tooltip"]') !== null;
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    });

    expect(focusedId).toBe("custom-column-type");
    expect(tooltipOpenedOnOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes with the first Escape after the focused disabled action is enabled by a finished load", () => {
    const onClose = vi.fn();
    const renderWidgetEditor = (loading: boolean) =>
      act(() => {
        reactRoot.render(
          createElement(
            TestAppModal,
            { actions: deleteAction(loading), open: true, title: "Widget", onClose },
            createElement("p", null, loading ? "Loading" : "Loaded"),
          ),
        );
      });

    renderWidgetEditor(true);
    const disabledTrigger = document.querySelector<HTMLElement>('[data-slot="app-modal-action-disabled-trigger"]');
    if (!disabledTrigger) throw new Error("Expected the disabled action trigger");
    act(() => disabledTrigger.focus());
    const tooltipOpenedOnFocus = document.querySelector('[role="tooltip"]') !== null;

    renderWidgetEditor(false);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    });

    expect(tooltipOpenedOnFocus).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("AppModalAction tooltip", () => {
  function renderAction(disabled: boolean) {
    act(() => {
      reactRoot.render(
        createElement(
          TooltipProvider,
          null,
          createElement(AppModalAction, {
            id: "delete",
            icon: Trash2,
            label: "Delete widget",
            disabled,
            onClick: vi.fn(),
          }),
        ),
      );
    });
  }

  it("closes the tooltip when a focused disabled action becomes enabled, so Escape reaches the dialog", () => {
    renderAction(true);
    const disabledTrigger = document.querySelector<HTMLElement>('[data-slot="app-modal-action-disabled-trigger"]');
    if (!disabledTrigger) throw new Error("Expected the disabled action trigger");

    act(() => disabledTrigger.focus());
    const openedOnFocus = document.querySelector('[role="tooltip"]') !== null;

    renderAction(false);

    expect(openedOnFocus).toBe(true);
    expect(document.querySelector('[data-slot="app-modal-action-disabled-trigger"]')).toBeNull();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
