import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard: vi.fn() }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => true }));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
  usePathname: () => "/company/webhooks",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));
vi.mock("../agent-tour-overlay", () => ({ AgentTourOverlay: () => null }));
vi.mock("../agent-route-reload", () => ({ AgentRouteReloadBridge: () => null }));
vi.mock("../use-agent-chat-config", () => ({ useAgentChatConfig: () => undefined }));
vi.mock("../agent-status-announcer", () => ({
  AgentProgressStatus: () => null,
  AgentStatusAnnouncer: () => null,
}));
vi.mock("../conversation-history", () => ({ ArchiveUndo: () => null, ConversationHistory: () => null }));
vi.mock("../suggested-questions", () => ({ SuggestedQuestions: () => null }));
vi.mock("../agent-conversation", async () => {
  const { MessageResponse } = await import("@/components/ai-elements/message");
  return {
    AgentComposer: () => createElement("textarea", { "aria-label": "Ask", id: "agent-composer" }),
    AgentConversationLog: () =>
      createElement(MessageResponse, { mode: "static" }, "Read [the webhook guide](https://example.com/webhooks/)."),
  };
});

import { AppModal } from "@/components/modal/app-modal";
import { AgentChat } from "../agent-chat";

type TestAppModalProps = Omit<ComponentProps<typeof AppModal>, "children"> & { children?: ReactNode };
const TestAppModal = AppModal as ComponentType<TestAppModalProps>;

const GUIDE_URL = "https://example.com/webhooks/";
const LINK_PROMPT = '[data-streamdown="link-safety-modal"], [data-slot="dialog-content"]';

let container: HTMLDivElement;
let reactRoot: Root;
let agentChatStore: Record<string, unknown> & { close: ReturnType<typeof vi.fn> };

function renderPanel(children: ReturnType<typeof createElement>[] = []) {
  act(() => {
    reactRoot.render(createElement("div", null, createElement(AgentChat), ...children));
  });
}

function pressEscape() {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
    );
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  agentChatStore = observable(
    {
      close: vi.fn(),
      conversationTitle: null,
      enabled: true,
      historyMutationPending: false,
      isExpanded: false,
      isHistoryOpen: false,
      isOpen: true,
      isWorking: false,
      items: [{ id: "answer" }],
      lastArchivedConversation: null,
      newConversation: vi.fn(),
      toggleExpanded: vi.fn(),
      toggleHistory: vi.fn(),
      usage: null,
    },
    { close: false, newConversation: false, toggleExpanded: false, toggleHistory: false },
    { deep: false },
  ) as typeof agentChatStore;
  testContext.rootStore = {
    agentChatStore,
    agentUiControlStore: observable({ active: null, registerNavigate: vi.fn() }, { registerNavigate: false }),
  };
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

describe("AgentChat panel", () => {
  it("closes only the link prompt when Escape dismisses it", () => {
    renderPanel();
    const link = container.querySelector<HTMLElement>(`[data-streamdown="link"], a[href="${GUIDE_URL}"]`);
    expect(link).not.toBeNull();

    act(() => link?.click());
    expect(document.querySelector(LINK_PROMPT)).not.toBeNull();

    pressEscape();

    expect(document.querySelector(LINK_PROMPT)).toBeNull();
    expect(agentChatStore.close).not.toHaveBeenCalled();
    expect(document.getElementById("agent-panel-dialog")).not.toBeNull();
  });

  it("still closes on Escape when no prompt is open", () => {
    renderPanel();

    pressEscape();

    expect(agentChatStore.close).toHaveBeenCalledOnce();
  });

  it("stays usable over an open app dialog", async () => {
    const onClose = vi.fn();
    renderPanel([
      createElement(
        TestAppModal,
        { key: "dialog", open: true, title: "Webhook", onClose },
        createElement("input", { "aria-label": "Secret", id: "webhook-modal-secret" }),
      ),
    ]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const composer = document.getElementById("agent-composer");
    expect(composer).not.toBeNull();

    act(() => {
      composer?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
      composer?.focus();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(composer);
    expect(document.getElementById("webhook-modal-secret")).not.toBeNull();
  });

  it("keeps an open dialog mounted and hands focus back to its field, unselected, when the panel closes", async () => {
    const getClientRects = Object.getOwnPropertyDescriptor(Element.prototype, "getClientRects");
    Object.defineProperty(Element.prototype, "getClientRects", {
      configurable: true,
      value: () => [new DOMRect(0, 0, 10, 10)],
    });
    try {
      const onClose = vi.fn();
      setPanelOpen(false);
      renderPanel([
        createElement(
          TestAppModal,
          { key: "dialog", open: true, title: "Invite", onClose },
          createElement(InviteContent),
        ),
      ]);
      await nextFrame();
      act(() => document.getElementById("invite-modal-tab-email")?.click());
      const content = document.querySelector('[data-slot="dialog-content"]');
      const emails = document.getElementById("invite-modal-emails") as HTMLInputElement;
      act(() => emails.focus());
      emails.value = "e2e-a11y-draft";
      emails.setSelectionRange(emails.value.length, emails.value.length);

      setPanelOpen(true);
      await nextFrame();

      expect(document.activeElement).toBe(document.getElementById("agent-composer"));

      setPanelOpen(false);
      await nextFrame();

      expect(document.querySelector('[data-slot="dialog-content"]')).toBe(content);
      expect(document.getElementById("invite-modal-emails")).toBe(emails);
      expect(document.activeElement).toBe(emails);
      expect(emails.value).toBe("e2e-a11y-draft");
      expect(emails.selectionStart).toBe(emails.value.length);
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      if (getClientRects) Object.defineProperty(Element.prototype, "getClientRects", getClientRects);
    }
  });
});

function InviteContent() {
  const [tab, setTab] = useState<"link" | "email">("link");

  return createElement(
    "div",
    null,
    createElement("button", { id: "invite-modal-tab-email", type: "button", onClick: () => setTab("email") }, "Email"),
    tab === "email" ? createElement("input", { "aria-label": "Emails", id: "invite-modal-emails" }) : null,
  );
}

function setPanelOpen(isOpen: boolean) {
  act(() => {
    runInAction(() => {
      agentChatStore.isOpen = isOpen;
    });
  });
}

async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}
