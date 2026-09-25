import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OVERLAY_TOPMOST_LAYER_CLASS } from "@/components/ui/overlay-contract";

const testContext = vi.hoisted(() => ({ isWide: true, rootStore: null as unknown }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => testContext.isWide }));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));

import { AppModal } from "../app-modal";

type TestAppModalProps = Omit<ComponentProps<typeof AppModal>, "children"> & { children?: ReactNode };
const TestAppModal = AppModal as ComponentType<TestAppModalProps>;

let container: HTMLDivElement;
let reactRoot: Root;
let assistant: {
  agentChatStore: { enabled: boolean | null; isOpen: boolean };
  agentUiControlStore: { active: { targetId: string } | null };
};

function renderPage(onClose: () => void) {
  act(() => {
    reactRoot.render(
      createElement(
        "div",
        null,
        createElement(
          TestAppModal,
          { open: true, title: "Webhook", onClose },
          createElement("input", { "aria-label": "Secret", id: "webhook-modal-secret" }),
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

function PageDialogWithGlobalConfirmation({ onClose }: { onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return createElement(
    "div",
    null,
    createElement(
      TestAppModal,
      { open: true, title: "Webhook", onClose },
      createElement("button", { id: "webhook-delete", type: "button", onClick: () => setConfirming(true) }, "Delete"),
    ),
    createElement(
      AlertDialog,
      { open: confirming, onOpenChange: setConfirming },
      createElement(
        AlertDialogContent,
        null,
        createElement(AlertDialogTitle, null, "Delete webhook"),
        createElement(AlertDialogDescription, null, "This cannot be undone."),
        createElement(AlertDialogCancel, { id: "confirm-delete-cancel" }, "Cancel"),
      ),
    ),
    createElement(
      "div",
      { "data-agent-surface": "", id: "agent-panel-dialog" },
      createElement("textarea", { "aria-label": "Ask", id: "agent-composer" }),
    ),
  );
}

function PageDialogWithAssistantConfirmation({ onClose }: { onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return createElement(
    "div",
    null,
    createElement(
      TestAppModal,
      { open: true, title: "Webhook", onClose },
      createElement("input", { "aria-label": "Secret", id: "webhook-modal-secret" }),
    ),
    createElement(
      "div",
      { "data-agent-surface": "", id: "agent-panel-dialog" },
      createElement(
        "button",
        { id: "agent-delete-chat", type: "button", onClick: () => setConfirming(true) },
        "Delete chat",
      ),
      createElement(
        TestAppModal,
        {
          layerClassName: OVERLAY_TOPMOST_LAYER_CLASS,
          open: confirming,
          title: "Delete chat",
          onClose: () => setConfirming(false),
        },
        createElement(
          "button",
          { id: "agent-delete-chat-cancel", type: "button", onClick: () => setConfirming(false) },
          "Cancel",
        ),
      ),
    ),
  );
}

function click(element: Element) {
  press(element);
  act(() => (element as HTMLElement).click());
}

async function settleOutsideListeners() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function press(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
  });
}

function element(id: string) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  assistant = {
    agentChatStore: observable({ enabled: true as boolean | null, isOpen: true }),
    agentUiControlStore: observable({ active: null as { targetId: string } | null }),
  };
  testContext.isWide = true;
  testContext.rootStore = assistant;
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  document.body.style.pointerEvents = "";
  testContext.rootStore = null;
});

describe("AppModal beside an open assistant surface", () => {
  it("keeps the dialog open while the assistant panel is pressed and focused", async () => {
    const onClose = vi.fn();
    renderPage(onClose);
    await settleOutsideListeners();
    const composer = element("agent-composer");

    press(composer);
    act(() => composer.focus());

    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(composer);
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(composer.closest("[aria-hidden='true']")).toBeNull();
    expect(element("webhook-modal-secret")).toBeTruthy();
  });

  it("still closes the dialog on an outside press that is not on an assistant surface", async () => {
    const onClose = vi.fn();
    renderPage(onClose);
    await settleOutsideListeners();

    press(element("page-button"));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open while a confirmation it opened takes focus", async () => {
    const onClose = vi.fn();
    act(() => {
      reactRoot.render(createElement(PageDialogWithGlobalConfirmation, { onClose }));
    });
    await settleOutsideListeners();

    click(element("webhook-delete"));
    await settleOutsideListeners();

    expect(document.activeElement).toBe(element("confirm-delete-cancel"));
    expect(onClose).not.toHaveBeenCalled();

    click(element("confirm-delete-cancel"));
    await settleOutsideListeners();

    expect(document.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();
    expect(element("webhook-delete")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the dialog open while a confirmation opened from the assistant takes focus", async () => {
    const onClose = vi.fn();
    act(() => {
      reactRoot.render(createElement(PageDialogWithAssistantConfirmation, { onClose }));
    });
    await settleOutsideListeners();

    click(element("agent-delete-chat"));
    await settleOutsideListeners();

    expect(document.activeElement).toBe(element("agent-delete-chat-cancel"));
    expect(onClose).not.toHaveBeenCalled();

    click(element("agent-delete-chat-cancel"));
    await settleOutsideListeners();

    expect(document.getElementById("agent-delete-chat-cancel")).toBeNull();
    expect(element("webhook-modal-secret")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lets a guided tour step reach its controls while the panel is closed", async () => {
    const onClose = vi.fn();
    runInAction(() => {
      assistant.agentChatStore.isOpen = false;
      assistant.agentUiControlStore.active = { targetId: "webhook-modal-secret" };
    });
    renderPage(onClose);
    await settleOutsideListeners();

    press(element("agent-composer"));

    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("releases an already open dialog when the assistant opens over it", async () => {
    const onClose = vi.fn();
    runInAction(() => {
      assistant.agentChatStore.isOpen = false;
    });
    renderPage(onClose);
    await settleOutsideListeners();
    const composer = element("agent-composer");

    act(() => composer.focus());
    expect(document.activeElement).not.toBe(composer);
    expect(document.body.style.pointerEvents).toBe("none");

    act(() => {
      runInAction(() => {
        assistant.agentChatStore.isOpen = true;
      });
    });
    await settleOutsideListeners();
    act(() => composer.focus());
    press(composer);

    expect(document.activeElement).toBe(composer);
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(composer.closest("[aria-hidden='true']")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays modal while no assistant surface is on screen", async () => {
    const onClose = vi.fn();
    runInAction(() => {
      assistant.agentChatStore.isOpen = false;
    });
    renderPage(onClose);
    await settleOutsideListeners();
    const pageButton = element("page-button");

    act(() => pageButton.focus());

    expect(document.activeElement).not.toBe(pageButton);
    expect(document.body.style.pointerEvents).toBe("none");
    expect(pageButton.closest("[aria-hidden='true']")).not.toBeNull();

    press(pageButton);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("switches an open small-screen drawer when the assistant opens and closes over it", async () => {
    const onClose = vi.fn();
    testContext.isWide = false;
    runInAction(() => {
      assistant.agentChatStore.isOpen = false;
    });
    renderPage(onClose);
    expect(document.querySelector('[data-slot="drawer-overlay"]')).not.toBeNull();

    act(() => {
      runInAction(() => {
        assistant.agentChatStore.isOpen = true;
      });
    });
    await settleOutsideListeners();
    const composer = element("agent-composer");
    act(() => composer.focus());
    press(composer);

    expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeNull();
    expect(document.activeElement).toBe(composer);
    expect(element("webhook-modal-secret")).toBeTruthy();

    act(() => {
      runInAction(() => {
        assistant.agentChatStore.isOpen = false;
      });
    });

    expect(document.querySelector('[data-slot="drawer-overlay"]')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
