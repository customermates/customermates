import type { Root as ReactRoot } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  pathname: "/records/00000000-0000-4000-8000-000000000001",
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
vi.mock("@/i18n/navigation", () => ({ usePathname: () => harness.pathname }));
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
    recordWorkspaceStore: {
      navigation: {
        canManageSchema: true,
        types: [{ id: "00000000-0000-4000-8000-000000000001", canCreate: true }],
      },
    },
  };
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("AgentStarterActions", () => {
  it("uses the configured type's creation permission when legacy resource grants are absent", () => {
    harness.root.userStore = { can: () => false };
    act(() => {
      reactRoot.render(createElement(AgentStarterActions, { pageId: "contacts", state: "empty", surface: "page" }));
    });
    expect(container.textContent).toContain("AgentChat.suggestions.pages.contacts.empty.first-contact.label");
  });

  it("hides creation suggestions when the type's current permission is revoked", () => {
    harness.root.recordWorkspaceStore = {
      navigation: {
        canManageSchema: false,
        types: [{ id: "00000000-0000-4000-8000-000000000001", canCreate: false }],
      },
    };
    act(() => {
      reactRoot.render(createElement(AgentStarterActions, { pageId: "contacts", state: "empty", surface: "page" }));
    });
    expect(container.textContent).not.toContain("AgentChat.suggestions.pages.contacts.empty.first-contact.label");
    expect(container.textContent).toContain("AgentChat.suggestions.readOnly.explain.label");
  });
  it("keeps the server and hydration fallback deterministic before showing AI actions", () => {
    const html = renderToStaticMarkup(
      createElement(AgentStarterActions, {
        fallback: createElement("button", null, "Manual add"),
        pageId: "routines",
        state: "empty",
        surface: "page",
      }),
    );

    expect(html).toBe("<button>Manual add</button>");
  });

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

  it("opens Mate with one of the three Routines onboarding prompts", () => {
    act(() => {
      reactRoot.render(
        createElement(AgentStarterActions, {
          pageId: "routines",
          state: "empty",
          surface: "page",
        }),
      );
    });

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(3);

    act(() => buttons[0]?.click());

    expect(harness.openWithDraft).toHaveBeenCalledWith(
      "AgentChat.suggestions.pages.routines.empty.first-routine.prompt",
    );
    expect(harness.focusComposer).toHaveBeenCalledOnce();
  });

  it("opens Mate with an ordinary website prompt from the first Wiki action, like every starter", () => {
    act(() => {
      reactRoot.render(
        createElement(AgentStarterActions, {
          pageId: "wiki",
          state: "empty",
          surface: "page",
        }),
      );
    });

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.textContent).toBe("AgentChat.suggestions.pages.wiki.empty.first-wiki-page.label");
    expect([...buttons].every((button) => button.hasAttribute("data-agent-focus-return"))).toBe(true);

    act(() => buttons[0]?.click());

    expect(harness.openWithDraft).toHaveBeenCalledExactlyOnceWith(
      "AgentChat.suggestions.pages.wiki.empty.first-wiki-page.prompt",
    );
    expect(harness.focusComposer).toHaveBeenCalledOnce();
  });

  it("keeps chat-surface chips out of the page focus-return order", () => {
    act(() => {
      reactRoot.render(createElement(AgentStarterActions, { pageId: "wiki", state: "empty" }));
    });

    expect(container.querySelector("button")?.textContent).toBe(
      "AgentChat.suggestions.pages.wiki.empty.first-wiki-page.label",
    );
    expect(container.querySelector("[data-agent-focus-return]")).toBeNull();
  });

  it("offers permission-safe Wiki guidance when the user cannot create pages", () => {
    harness.root = {
      agentChatStore: {
        counts: null,
        enabled: true,
        openWithDraft: harness.openWithDraft,
      },
      userStore: { can: () => false },
      recordWorkspaceStore: { navigation: null },
    };

    act(() => {
      reactRoot.render(
        createElement(AgentStarterActions, {
          pageId: "wiki",
          state: "empty",
          surface: "page",
        }),
      );
    });

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.textContent).toContain("AgentChat.suggestions.readOnly.explain.label");

    act(() => buttons[0]?.click());

    expect(harness.openWithDraft).toHaveBeenCalledWith("AgentChat.suggestions.readOnly.explain.prompt");
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
