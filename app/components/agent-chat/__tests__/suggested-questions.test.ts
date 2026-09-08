import type { Root as ReactRoot } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  focusComposer: vi.fn(),
  openWithDraft: vi.fn(),
  root: {} as Record<string, unknown>,
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T>(component: T) => component,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/contacts" }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => harness.root,
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ map: () => ({}) }),
}));
vi.mock("../chat-ui", () => ({ focusAgentComposer: harness.focusComposer }));

import { AgentStarterActions } from "../suggested-questions";

let container: HTMLDivElement;
let reactRoot: ReactRoot;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
  harness.root = {
    agentChatStore: {
      counts: null,
      enabled: true,
      openWithDraft: harness.openWithDraft,
    },
    userStore: { can: () => true },
  };
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("AgentStarterActions", () => {
  it("opens Mate with the page-specific empty-state prompt", () => {
    act(() => {
      reactRoot.render(
        createElement(AgentStarterActions, {
          pageId: "contacts",
          state: "empty",
          surface: "page",
        }),
      );
    });

    const buttons = container.querySelectorAll("button");
    expect(container.querySelector('[data-testid="empty-page-agent-suggestions"]')).not.toBeNull();
    expect(buttons).toHaveLength(3);

    act(() => buttons[0]?.click());

    expect(harness.openWithDraft).toHaveBeenCalledWith(
      "AgentChat.suggestions.pages.contacts.empty.setup-contacts.prompt",
    );
    expect(harness.focusComposer).toHaveBeenCalledOnce();
  });

  it("keeps the manual action when Mate is unavailable", () => {
    harness.root = {
      agentChatStore: { counts: null, enabled: false },
      userStore: { can: () => true },
    };

    act(() => {
      reactRoot.render(
        createElement(AgentStarterActions, {
          fallback: createElement("button", null, "Manual add"),
          pageId: "contacts",
          state: "empty",
          surface: "page",
        }),
      );
    });

    expect(container.textContent).toBe("Manual add");
    expect(container.querySelector('[data-testid="empty-page-agent-suggestions"]')).toBeNull();
  });

  it("keeps the manual action when Mate is blocked", () => {
    harness.root = {
      agentChatStore: {
        counts: null,
        enabled: true,
        openWithDraft: harness.openWithDraft,
        usage: { blockedReason: "credits_exhausted" },
      },
      userStore: { can: () => true },
    };

    act(() => {
      reactRoot.render(
        createElement(AgentStarterActions, {
          fallback: createElement("button", null, "Manual add"),
          pageId: "contacts",
          state: "empty",
          surface: "page",
        }),
      );
    });

    expect(container.textContent).toBe("Manual add");
    expect(harness.openWithDraft).not.toHaveBeenCalled();
  });
});
