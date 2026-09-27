import type { Root as ReactRoot } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  focusComposer: vi.fn(),
  openWithDraft: vi.fn(),
  openWikiHomepageSetup: vi.fn(),
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
vi.mock("@/components/wiki/wiki-homepage-setup", () => ({
  EMPTY_WIKI_HOMEPAGE_SETUP_STATE: { status: "idle", homepage: null, domain: null, conversationId: null, pages: [] },
}));

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
      openWikiHomepageSetup: harness.openWikiHomepageSetup,
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

  it("opens the website setup panel from the first Wiki action without drafting a prompt", () => {
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
    expect(buttons[0]?.textContent).toBe("WikiSetup.startFromWebsite");
    expect([...buttons].every((button) => button.hasAttribute("data-agent-focus-return"))).toBe(true);

    act(() => buttons[0]?.click());

    expect(harness.openWikiHomepageSetup).toHaveBeenCalledExactlyOnceWith({
      status: "idle",
      homepage: null,
      domain: null,
      conversationId: null,
      pages: [],
    });
    expect(harness.openWithDraft).not.toHaveBeenCalled();
    expect(harness.focusComposer).not.toHaveBeenCalled();
  });

  it.each([
    ["Mate is working", { isWorking: true }],
    ["a history change is pending", { historyMutationPending: "archive" }],
  ])("disables website setup while %s", (_reason, busy) => {
    Object.assign(harness.root.agentChatStore as object, busy);
    act(() => {
      reactRoot.render(createElement(AgentStarterActions, { pageId: "wiki", state: "empty", surface: "page" }));
    });

    const first = container.querySelector<HTMLButtonElement>("button");
    expect(first?.disabled).toBe(true);
    act(() => first?.click());
    expect(harness.openWikiHomepageSetup).not.toHaveBeenCalled();
  });

  it("keeps chat-surface chips out of the page focus-return order", () => {
    act(() => {
      reactRoot.render(createElement(AgentStarterActions, { pageId: "wiki", state: "empty" }));
    });

    expect(container.querySelector("button")?.textContent).toBe("WikiSetup.startFromWebsite");
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
