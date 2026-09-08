import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: {} as Record<string, unknown>,
  store: {} as Record<string, unknown>,
  setupProps: null as null | { onAccepted: (conversationId: string) => Promise<void> },
  replace: vi.fn(),
  refresh: vi.fn(),
  open: vi.fn(),
  loadConfig: vi.fn(),
  selectConversation: vi.fn(),
  tryNavigate: vi.fn((navigate: () => void) => {
    navigate();
    return true;
  }),
}));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: harness.replace, refresh: harness.refresh }),
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn() }),
}));
vi.mock("@/components/editor/editor", () => ({
  Editor: ({ readOnly }: { readOnly?: boolean }) => createElement("div", { "data-editor-readonly": Boolean(readOnly) }),
}));
vi.mock("@/components/editor/editor.utils", () => ({
  parseMarkdownToJSON: (markdown: string) => ({ markdown }),
  serializeJSONToMarkdown: () => "",
}));
vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children?: ReactNode }) => createElement("form", null, children),
}));
vi.mock("@/components/forms/form-input", () => ({ FormInput: () => createElement("input") }));
vi.mock("@/components/shared/icon", () => ({ Icon: () => createElement("span") }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => {
    const buttonProps = Object.fromEntries(
      Object.entries(props).filter(([name]) => !["asChild", "size", "variant"].includes(name)),
    );
    return createElement("button", buttonProps, children);
  },
}));
vi.mock("@/components/wiki/wiki-homepage-setup", () => ({
  WikiHomepageSetup: (props: { onAccepted: (conversationId: string) => Promise<void> }) => {
    harness.setupProps = props;
    return createElement("div", { "data-wiki-homepage-setup": true });
  },
}));
vi.mock("../wiki-page.store", () => ({
  WikiPageStore: function WikiPageStore() {
    return harness.store;
  },
}));

import { WikiPageView } from "../wiki-page-view";

const listPage = { items: [], total: 0, page: 1, pageSize: 25 };

function render(canManage: boolean, agentChatEnabled: boolean, agentEnabled = agentChatEnabled) {
  harness.store = {
    canManage,
    editing: false,
    form: { id: null, title: "", markdown: "", updatedAt: null },
    isLoading: false,
    load: vi.fn(),
    startCreate: vi.fn(),
  };
  harness.rootStore = {
    agentChatEnabled,
    agentChatStore: {
      enabled: agentEnabled,
      open: harness.open,
      loadConfig: harness.loadConfig,
      selectConversation: harness.selectConversation,
    },
    navigationGuard: { tryNavigate: harness.tryNavigate },
  };

  return renderToStaticMarkup(createElement(WikiPageView, { initialPage: null, listPage }));
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.setupProps = null;
  harness.loadConfig.mockResolvedValue("ready");
  harness.selectConversation.mockResolvedValue(undefined);
});

describe("Wiki empty state", () => {
  it("shows a neutral read-only state without creation controls", () => {
    const html = render(false, true);

    expect(html).toContain("Wiki.emptyBodyReadOnly");
    expect(html).not.toContain("data-wiki-homepage-setup");
    expect(html).not.toContain("Wiki.newPage");
  });

  it("keeps manual creation but removes Mate copy and separator when Agent is unavailable", () => {
    const html = render(true, true, false);

    expect(html).toContain("Wiki.emptyBodyManual");
    expect(html).toContain("Wiki.newPage");
    expect(html).not.toContain("Wiki.emptyBody</p>");
    expect(html).not.toContain("data-wiki-homepage-setup");
    expect(html).not.toContain("my-4 border-t");
  });

  it("offers both Mate setup and manual creation to managers when Agent is available", async () => {
    const html = render(true, true);

    expect(html).toContain("Wiki.emptyBody");
    expect(html).toContain("data-wiki-homepage-setup");
    expect(html).toContain("Wiki.newPage");
    expect(harness.setupProps).not.toBeNull();

    await harness.setupProps?.onAccepted("conversation-1");

    expect(harness.open).toHaveBeenCalledOnce();
    expect(harness.loadConfig).toHaveBeenCalledOnce();
    expect(harness.selectConversation).toHaveBeenCalledExactlyOnceWith("conversation-1");
  });

  it("requires both the deployment flag and tenant Agent entitlement for Mate setup", () => {
    expect(render(true, false, true)).not.toContain("data-wiki-homepage-setup");
    expect(render(true, true, false)).not.toContain("data-wiki-homepage-setup");
  });
});
