import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement, useState, useSyncExternalStore } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
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
vi.mock("@/hooks/use-media-query", () => ({
  useIsWiderThan: () =>
    useSyncExternalStore(
      () => () => undefined,
      () => testContext.isWide,
      () => true,
    ),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));

import { AppModal } from "../app-modal";
import { assistantSurfaceProps } from "../assistant-surface";

type TestAppModalProps = Omit<ComponentProps<typeof AppModal>, "children"> & { children?: ReactNode };
const TestAppModal = AppModal as ComponentType<TestAppModalProps>;

const SURFACES = [
  ["dialog", true],
  ["drawer", false],
] as const;

let container: HTMLDivElement;
let reactRoot: Root;
let assistant: {
  agentChatStore: { enabled: boolean | null; isOpen: boolean };
  agentUiControlStore: { active: { targetId: string } | null };
};

function AssistantPanel({ children }: { children?: ReactNode }) {
  return createElement(
    "div",
    { ...assistantSurfaceProps(), id: "agent-panel-dialog" },
    createElement("textarea", { "aria-label": "Ask", id: "agent-composer" }),
    createElement("button", { id: "agent-send", type: "button" }, "Send"),
    children,
  );
}

function InviteContent() {
  const [tab, setTab] = useState<"link" | "email">("link");

  return createElement(
    "div",
    null,
    createElement(
      "button",
      { "aria-pressed": tab === "email", id: "invite-modal-tab-email", type: "button", onClick: () => setTab("email") },
      "Send emails",
    ),
    tab === "email"
      ? createElement("input", { "aria-label": "Emails", id: "invite-modal-emails" })
      : createElement("p", { id: "invite-modal-link" }, "Share link"),
  );
}

function renderPage({ assistantOpen, onClose }: { assistantOpen: boolean; onClose: () => void }) {
  act(() => {
    runInAction(() => {
      assistant.agentChatStore.isOpen = assistantOpen;
    });
    reactRoot.render(
      createElement(
        "div",
        null,
        assistantOpen ? createElement(AssistantPanel, { key: "assistant" }) : null,
        createElement(
          TestAppModal,
          { key: "dialog", open: true, title: "Invite", onClose },
          createElement(InviteContent),
        ),
        createElement("button", { id: "page-button", key: "page", type: "button" }, "Page"),
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
    createElement(AssistantPanel),
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
      AssistantPanel,
      null,
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

function AssistantLinkPrompt() {
  const [prompting, setPrompting] = useState(false);

  return createElement(
    AssistantPanel,
    null,
    createElement(
      "a",
      {
        href: "https://example.org/docs",
        id: "agent-message-link",
        onClick: (event: { preventDefault: () => void }) => {
          event.preventDefault();
          setPrompting(true);
        },
      },
      "Example site",
    ),
    createElement(
      TestAppModal,
      {
        layerClassName: OVERLAY_TOPMOST_LAYER_CLASS,
        open: prompting,
        size: "sm",
        title: "Open external link",
        onClose: () => setPrompting(false),
      },
      createElement("button", { id: "agent-link-copy", type: "button" }, "Copy link"),
    ),
  );
}

function click(target: Element) {
  press(target);
  act(() => (target as HTMLElement).click());
}

async function settleOutsideListeners() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function press(target: Element) {
  act(() => {
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
  });
}

function focus(target: Element) {
  act(() => (target as HTMLElement).focus());
}

function wheel(target: Element) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40 });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function element(id: string) {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found;
}

function overlayContent(surface: "dialog" | "drawer") {
  return document.querySelector<HTMLElement>(`[data-slot="${surface}-content"]`);
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  assistant = {
    agentChatStore: observable({ enabled: true as boolean | null, isOpen: false }),
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

describe.each(SURFACES)("AppModal %s beside the assistant", (surface, isWide) => {
  beforeEach(() => {
    testContext.isWide = isWide;
  });

  it("keeps the open content mounted with its tab, typed text and focus while the assistant opens and closes", async () => {
    const onClose = vi.fn();
    renderPage({ assistantOpen: false, onClose });
    await settleOutsideListeners();
    act(() => element("invite-modal-tab-email").click());
    const content = overlayContent(surface);
    const emails = element("invite-modal-emails") as HTMLInputElement;
    focus(emails);
    emails.value = "e2e-a11y-draft";

    renderPage({ assistantOpen: true, onClose });
    await settleOutsideListeners();
    act(() => {
      runInAction(() => {
        assistant.agentUiControlStore.active = { targetId: "invite-modal-emails" };
      });
    });

    expect(overlayContent(surface)).toBe(content);
    expect(document.getElementById("invite-modal-emails")).toBe(emails);
    expect(document.activeElement).toBe(emails);

    focus(element("agent-composer"));
    expect(document.activeElement).toBe(element("agent-composer"));

    focus(emails);
    act(() => {
      runInAction(() => {
        assistant.agentUiControlStore.active = null;
      });
    });
    renderPage({ assistantOpen: false, onClose });
    await settleOutsideListeners();

    expect(overlayContent(surface)).toBe(content);
    expect(document.getElementById("invite-modal-emails")).toBe(emails);
    expect(emails.value).toBe("e2e-a11y-draft");
    expect(element("invite-modal-tab-email").getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(emails);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays modal while the assistant panel takes presses, focus and wheel scrolling", async () => {
    const onClose = vi.fn();
    renderPage({ assistantOpen: true, onClose });
    await settleOutsideListeners();
    const panel = element("agent-panel-dialog");
    const composer = element("agent-composer");

    expect(document.body.style.pointerEvents).toBe("none");
    expect(panel.style.pointerEvents).toBe("auto");
    expect(composer.closest("[aria-hidden='true']")).toBeNull();
    expect(element("page-button").closest("[aria-hidden='true']")).not.toBeNull();

    press(composer);
    focus(composer);
    expect(document.activeElement).toBe(composer);

    focus(element("agent-send"));
    expect(document.activeElement).toBe(element("agent-send"));

    expect(wheel(composer).defaultPrevented).toBe(false);
    expect(wheel(element("page-button")).defaultPrevented).toBe(true);

    focus(element("page-button"));
    expect(overlayContent(surface)?.contains(document.activeElement)).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves focus into the content when it opens", async () => {
    renderPage({ assistantOpen: false, onClose: vi.fn() });
    await settleOutsideListeners();

    expect(overlayContent(surface)?.contains(document.activeElement)).toBe(true);
  });

  it("still closes on an outside press that is not on an assistant surface", async () => {
    const onClose = vi.fn();
    renderPage({ assistantOpen: true, onClose });
    await settleOutsideListeners();

    press(element("page-button"));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the page inert while no assistant surface is on screen", async () => {
    const onClose = vi.fn();
    renderPage({ assistantOpen: false, onClose });
    await settleOutsideListeners();
    const pageButton = element("page-button");

    focus(pageButton);

    expect(document.activeElement).not.toBe(pageButton);
    expect(document.body.style.pointerEvents).toBe("none");
    expect(pageButton.closest("[aria-hidden='true']")).not.toBeNull();
  });
});

describe("AppModal launched from the assistant", () => {
  it.each([
    ["dialog", true],
    ["drawer", false],
  ])("moves focus into the link prompt %s when it opens", async (surface, isWide) => {
    testContext.isWide = isWide;
    act(() => {
      reactRoot.render(createElement(AssistantLinkPrompt));
    });
    const link = element("agent-message-link");
    focus(link);

    act(() => link.click());
    await settleOutsideListeners();

    expect(overlayContent(surface as "dialog" | "drawer")?.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(element("agent-link-copy"));
  });
});

describe("AppModal confirmations beside the assistant", () => {
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
});

describe("AppModal initial hydration", () => {
  it("uses the client mobile presentation when a server-rendered modal is already open", async () => {
    testContext.isWide = false;
    const onClose = vi.fn();
    const content = createElement(
      TestAppModal,
      { open: true, title: "Hydrated modal", onClose },
      createElement("input", { id: "hydrated-modal-input", "aria-label": "Hydrated draft" }),
    );
    const html = renderToString(content);
    act(() => reactRoot.unmount());
    container.innerHTML = html;
    await act(async () => {
      reactRoot = hydrateRoot(container, content);
      await Promise.resolve();
    });
    await settleOutsideListeners();
    expect(overlayContent("drawer")).not.toBeNull();
    expect(overlayContent("dialog")).toBeNull();
    expect(element("hydrated-modal-input").closest("[aria-hidden='true']")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
