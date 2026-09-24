import type { Root } from "react-dom/client";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  setupProps: null as null | {
    canStart: boolean;
    compact: boolean;
    onAccepted: (conversationId: string) => Promise<void>;
    onStarted: (state: WikiHomepageSetupState) => void;
    onSkip: () => void;
  },
  store: {
    usage: null as null | { blockedReason: string | null },
    conversationId: null as string | null,
    conversationLoadError: false,
    markWikiHomepageSetupAccepted: vi.fn(),
    selectConversation: vi.fn(),
    dismissWikiHomepageSetup: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ agentChatStore: harness.store }),
}));
vi.mock("@/components/wiki/wiki-homepage-setup", () => ({
  WikiHomepageSetup: (props: {
    canStart: boolean;
    compact: boolean;
    onAccepted: (conversationId: string) => Promise<void>;
    onStarted: (state: WikiHomepageSetupState) => void;
    onSkip: () => void;
  }) => {
    harness.setupProps = props;
    return createElement("div", { "data-testid": "trusted-wiki-setup" });
  },
}));

import { AgentWikiHomepageSetup } from "../agent-wiki-homepage-setup";

let container: HTMLDivElement;
let root: Root;

const initialState = {
  status: "idle" as const,
  homepage: null,
  domain: null,
  conversationId: null,
  pages: [],
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.setupProps = null;
  harness.store.usage = null;
  harness.store.conversationId = null;
  harness.store.conversationLoadError = false;
  harness.store.selectConversation.mockImplementation((conversationId: string) => {
    harness.store.conversationId = conversationId;
    return Promise.resolve();
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(AgentWikiHomepageSetup, { initialState })));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AgentWikiHomepageSetup", () => {
  it("reuses the trusted compact setup and switches to its durable conversation", async () => {
    expect(container.querySelector('[data-testid="trusted-wiki-setup"]')).not.toBeNull();
    expect(harness.setupProps).toMatchObject({ compact: true, canStart: true });

    const workingState = {
      status: "working" as const,
      homepage: "https://example.com/",
      domain: "example.com",
      conversationId: "conversation-1",
      pages: [],
    };
    act(() => harness.setupProps?.onStarted(workingState));
    await act(async () => {
      await harness.setupProps?.onAccepted("conversation-1");
    });

    expect(harness.store.markWikiHomepageSetupAccepted).toHaveBeenCalledExactlyOnceWith(workingState);
    expect(harness.store.selectConversation).toHaveBeenCalledExactlyOnceWith("conversation-1");
    expect(harness.store.dismissWikiHomepageSetup).toHaveBeenCalledOnce();
  });

  it("keeps setup visible when the accepted conversation cannot be loaded", async () => {
    harness.store.selectConversation.mockImplementation(() => {
      harness.store.conversationLoadError = true;
      return Promise.resolve();
    });

    await act(async () => {
      await harness.setupProps?.onAccepted("conversation-1");
    });

    expect(harness.store.dismissWikiHomepageSetup).not.toHaveBeenCalled();
  });

  it("closes the panel when setup is skipped", () => {
    act(() => harness.setupProps?.onSkip());

    expect(harness.store.close).toHaveBeenCalledOnce();
  });

  it("disables setup when Mate usage is blocked", () => {
    harness.store.usage = { blockedReason: "credits" };

    act(() => root.render(createElement(AgentWikiHomepageSetup, { initialState, key: "blocked" })));

    expect(harness.setupProps?.canStart).toBe(false);
  });
});
