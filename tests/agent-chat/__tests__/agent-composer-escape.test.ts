// @vitest-environment jsdom

import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => true }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => testContext.rootStore }));
vi.mock("@/app/components/agent-chat/agent-tour-overlay", () => ({ AgentTourOverlay: () => null }));
vi.mock("@/app/components/agent-chat/agent-route-reload", () => ({ AgentRouteReloadBridge: () => null }));
vi.mock("@/app/components/agent-chat/use-agent-chat-config", () => ({ useAgentChatConfig: () => undefined }));
vi.mock("@/app/components/agent-chat/agent-status-announcer", () => ({
  AgentProgressStatus: () => null,
  AgentStatusAnnouncer: () => null,
}));
vi.mock("@/app/components/agent-chat/conversation-history", () => ({
  ArchiveUndo: () => null,
  ConversationHistory: () => null,
}));
vi.mock("@/app/components/agent-chat/agent-wiki-homepage-setup", () => ({ AgentWikiHomepageSetup: () => null }));
vi.mock("@/app/components/agent-chat/suggested-questions", () => ({ SuggestedQuestions: () => null }));
vi.mock("@/app/components/agent-chat/agent-conversation", async () => {
  const { AgentComposerTextInput } = await import("@/app/components/agent-chat/agent-composer-text-input");
  return {
    AgentComposer: () =>
      createElement(AgentComposerTextInput, {
        id: "agent-composer",
        label: "Ask",
        placeholder: "Ask your CRM",
        value: "",
        onChange: () => undefined,
        onContextShortcut: () => undefined,
        onSubmit: () => undefined,
      }),
    AgentConversationLog: () => null,
  };
});

import { AgentChat } from "@/app/components/agent-chat/agent-chat";

let container: HTMLDivElement;
let reactRoot: Root;
let agentChatStore: { close: ReturnType<typeof vi.fn> };
let agentUiControlStore: { active: unknown; registerNavigate: ReturnType<typeof vi.fn> };

async function renderPanel() {
  await act(async () => {
    reactRoot.render(createElement(AgentChat));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const composer = document.getElementById("agent-composer");
  if (!composer) throw new Error("Missing Mate composer");
  act(() => composer.focus());
  return composer;
}

function pressEscapeIn(element: HTMLElement) {
  const escape = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape", keyCode: 27 });
  act(() => {
    element.dispatchEvent(escape);
  });
  return escape;
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
      items: [],
      lastArchivedConversation: null,
      newConversation: vi.fn(),
      toggleExpanded: vi.fn(),
      toggleHistory: vi.fn(),
      usage: null,
    },
    { close: false, newConversation: false, toggleExpanded: false, toggleHistory: false },
    { deep: false },
  );
  agentUiControlStore = observable({ active: null, registerNavigate: vi.fn() }, { registerNavigate: false });
  testContext.rootStore = { agentChatStore, agentUiControlStore };
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  testContext.rootStore = null;
});

describe("Escape in the Mate composer", () => {
  it("closes the panel when no page overlay, tour or highlight is open", async () => {
    const composer = await renderPanel();
    expect(composer.closest("[data-agent-surface]")?.id).toBe("agent-panel-dialog");
    expect(document.activeElement).toBe(composer);

    const escape = pressEscapeIn(composer);

    expect(escape.defaultPrevented).toBe(true);
    expect(agentChatStore.close).toHaveBeenCalledOnce();
  });

  it("leaves the panel open while a highlight is showing", async () => {
    const composer = await renderPanel();
    act(() => {
      runInAction(() => {
        agentUiControlStore.active = { note: null, stepIndex: 0, targetId: "nav-contacts", totalSteps: 1 };
      });
    });

    pressEscapeIn(composer);

    expect(agentChatStore.close).not.toHaveBeenCalled();
  });
});
