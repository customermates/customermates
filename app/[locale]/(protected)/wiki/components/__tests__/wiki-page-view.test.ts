import type { ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";
import type * as TopBarActionsModule from "@/app/components/topbar-actions-context";

import { act, createElement, startTransition, Suspense, use, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: {} as Record<string, unknown>,
  store: {} as Record<string, unknown>,
  setupProps: null as null | {
    onAccepted: (conversationId: string) => Promise<void>;
  },
  replace: vi.fn(),
  push: vi.fn(),
  topBar: null as ReactNode,
  toolbarRenders: 0,
  editorProps: null as null | { data?: object; onChange?: (value: object) => void },
  refresh: vi.fn(),
  open: vi.fn(),
  loadConfig: vi.fn(),
  selectConversation: vi.fn(),
  tryNavigate: vi.fn((navigate: () => void) => {
    navigate();
    return true;
  }),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => harness.rootStore,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: harness.replace, refresh: harness.refresh, push: harness.push }),
}));
vi.mock("@/app/components/topbar-actions-context", async (importOriginal) => {
  const actual = await importOriginal<typeof TopBarActionsModule>();
  return {
    ...actual,
    useSetTopBarActions: (node: ReactNode) => {
      harness.topBar = node;
      harness.toolbarRenders += 1;
      if (harness.toolbarRenders > 30) throw new Error("Wiki kept republishing its toolbar.");
      actual.useSetTopBarActions(node);
    },
  };
});
vi.mock("../use-wiki-pages", () => ({
  useWikiPages: (result: unknown) => ({
    result,
    query: "",
    loading: false,
    failed: false,
    page: 1,
    search: vi.fn(),
    setPage: vi.fn(),
    retry: vi.fn(),
  }),
}));
vi.mock("../wiki-link-picker", () => ({ WikiLinkPicker: () => null }));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: () => null,
  SheetContent: () => null,
  SheetHeader: () => null,
  SheetTitle: () => null,
  SheetBody: () => null,
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn() }),
}));
vi.mock("@/components/editor/editor", () => ({
  Editor: (props: { readOnly?: boolean; data?: object; onChange?: (value: object) => void }) => {
    harness.editorProps = props;
    return createElement("div", { "data-editor-readonly": Boolean(props.readOnly) });
  },
}));
vi.mock("@/components/editor/editor.utils", () => ({
  parseMarkdownToJSON: (markdown: string) => ({ markdown }),
  serializeJSONToMarkdown: () => "",
}));
vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children, id }: { children?: ReactNode; id?: string }) => createElement("form", { id }, children),
}));
vi.mock("@/components/forms/form-input", () => ({
  FormInput: ({ label: _label, ...props }: { label?: unknown; [key: string]: unknown }) =>
    createElement("input", props),
}));
vi.mock("@/components/shared/icon", () => ({
  Icon: () => createElement("span"),
}));
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
import { TopBarActionsProvider, useTopBarActions } from "@/app/components/topbar-actions-context";

const listPage = { items: [], total: 0, page: 1, pageSize: 25 };
const page = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Company knowledge",
  markdown: "Our documented process.",
  createdAt: new Date("2026-09-09T00:00:00.000Z"),
  updatedAt: new Date("2026-09-09T00:00:00.000Z"),
};
const populatedList = { ...listPage, items: [page], total: 1 };
const mountedRoots: ReactRoot[] = [];
const mountedContainers: HTMLElement[] = [];

function configure(canManage: boolean, agentChatEnabled: boolean, agentEnabled: boolean | null = agentChatEnabled) {
  harness.store = {
    canManage,
    creating: false,
    form: { id: null, title: "", markdown: "", updatedAt: null },
    isLoading: false,
    hasUnsavedChanges: false,
    editorDocument: { type: "doc", content: [{ type: "paragraph" }] },
    onEditorChange: vi.fn(),
    receivePage: vi.fn(),
    load: vi.fn(),
    reload: vi.fn(),
    resetForm: vi.fn(),
    resetDocument: vi.fn(),
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
}

async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  mountedContainers.push(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });

  return { container, root };
}

function render(canManage: boolean, agentChatEnabled: boolean, agentEnabled: boolean | null = agentChatEnabled) {
  configure(canManage, agentChatEnabled, agentEnabled);

  return renderToStaticMarkup(createElement(WikiPageView, { initialPage: null, listPage }));
}

async function hydrate(
  canManage: boolean,
  agentChatEnabled: boolean,
  serverAgentEnabled: boolean | null = agentChatEnabled,
  clientAgentEnabled: boolean | null = serverAgentEnabled,
) {
  configure(canManage, agentChatEnabled, serverAgentEnabled);
  const view = createElement(WikiPageView, { initialPage: null, listPage });
  const serverHtml = renderToStaticMarkup(view);
  const container = document.createElement("div");
  container.innerHTML = serverHtml;
  document.body.append(container);
  mountedContainers.push(container);

  configure(canManage, agentChatEnabled, clientAgentEnabled);
  const recoverableErrors: unknown[] = [];
  let root: ReactRoot | undefined;
  await act(async () => {
    root = hydrateRoot(container, view, {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
    await Promise.resolve();
  });
  if (!root) throw new Error("Expected hydration to create a React root");
  mountedRoots.push(root);

  return { container, recoverableErrors, serverHtml };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  harness.tryNavigate.mockImplementation((navigate: () => void) => {
    navigate();
    return true;
  });
  harness.setupProps = null;
  harness.topBar = null;
  harness.toolbarRenders = 0;
  harness.loadConfig.mockResolvedValue("ready");
  harness.selectConversation.mockResolvedValue(undefined);
});

describe("Wiki document view", () => {
  it("settles with the real toolbar provider and updates actions without republishing the toolbar", async () => {
    configure(true, false);
    harness.store.form = page;
    harness.store = observable(harness.store);
    function Toolbar() {
      return createElement("header", null, useTopBarActions().actions);
    }
    const { container } = await mount(
      createElement(TopBarActionsProvider, null, [
        createElement(Toolbar, { key: "toolbar" }),
        createElement(WikiPageView, { key: "wiki", initialPage: page, listPage: populatedList }),
      ]),
    );
    const save = () => container.querySelector<HTMLButtonElement>('header [aria-label="Wiki.save"]');
    expect(save()?.disabled).toBe(true);
    expect(harness.toolbarRenders).toBeLessThan(10);
    const settledRenders = harness.toolbarRenders;

    act(() =>
      runInAction(() => {
        harness.store.hasUnsavedChanges = true;
      }),
    );
    expect(save()?.disabled).toBe(false);
    expect(container.querySelector('header [aria-label="Common.actions.reset"]')).not.toBeNull();
    expect(harness.toolbarRenders).toBe(settledRenders);

    act(() =>
      runInAction(() => {
        harness.store.isLoading = true;
      }),
    );
    expect(save()?.disabled).toBe(true);
    expect(harness.toolbarRenders).toBeLessThan(10);
  });

  it("opens directly in the Notes editor with global Save and Reset associated with its form", async () => {
    configure(true, false);
    harness.store.form = page;
    harness.store.hasUnsavedChanges = true;
    const { container } = await mount(createElement(WikiPageView, { initialPage: page, listPage: populatedList }));
    const { container: topBar } = await mount(harness.topBar);
    const form = container.querySelector("form");
    const save = topBar.querySelector<HTMLButtonElement>('[aria-label="Wiki.save"]');

    expect(container.querySelector('[data-editor-readonly="false"]')).not.toBeNull();
    expect(harness.editorProps?.data).toBe(harness.store.editorDocument);
    expect(harness.editorProps?.onChange).toBe(harness.store.onEditorChange);
    expect(container.querySelector('input[aria-label="Wiki.pageTitle"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Wiki.edit");
    expect(save?.disabled).toBe(false);
    expect(save?.getAttribute("type")).toBe("submit");
    expect(save?.getAttribute("form")).toBe(form?.id);

    act(() => topBar.querySelector<HTMLButtonElement>('[aria-label="Common.actions.reset"]')?.click());
    expect(harness.store.resetDocument).toHaveBeenCalledOnce();
  });

  it("renders readers without edit, Save, or New controls", () => {
    configure(false, false);
    harness.store.form = page;
    const html = renderToStaticMarkup(createElement(WikiPageView, { initialPage: page, listPage: populatedList }));
    const topBar = renderToStaticMarkup(harness.topBar);

    expect(html).toContain('data-editor-readonly="true"');
    expect(html).toContain(`<h1 class="break-words text-3xl font-semibold tracking-tight">${page.title}</h1>`);
    expect(html).not.toContain('aria-label="Wiki.pageTitle"');
    expect(topBar).not.toContain("Wiki.save");
    expect(topBar).not.toContain("Wiki.newPage");
  });

  it("pins a selected AGENTS.md outside the current page without changing pagination", async () => {
    configure(false, false);
    const agents = { ...page, id: "10000000-0000-4000-8000-000000000099", title: "AGENTS.md" };
    const firstPage = Array.from({ length: 25 }, (_, index) => ({
      ...page,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      title: `Page ${index + 1}`,
    }));
    const paginated = { ...listPage, items: firstPage, total: 26 };
    harness.store.form = agents;

    const { container } = await mount(
      createElement(WikiPageView, { initialPage: agents, listPage: paginated, pinnedPage: agents }),
    );

    expect(container.querySelectorAll("nav button")).toHaveLength(26);
    expect(container.querySelector('nav [aria-current="page"]')?.textContent).toBe("AGENTS.md");
    expect(container.textContent).toContain("Wiki.page");
  });

  it("shows an unavailable target without substituting a document or offering homepage setup", () => {
    configure(true, true);
    const html = renderToStaticMarkup(
      createElement(WikiPageView, { initialPage: null, listPage: populatedList, unavailable: true }),
    );

    expect(html).toContain("Wiki.unavailableTitle");
    expect(html).not.toContain("data-editor-readonly");
    expect(html).not.toContain("Wiki.emptyTitle");
    expect(html).not.toContain("data-wiki-homepage-setup");
  });

  it("keeps a new draft until navigation is confirmed, including returning to its original page", async () => {
    configure(true, false);
    harness.store.creating = true;
    harness.store.hasUnsavedChanges = true;
    let pending: (() => void) | undefined;
    harness.tryNavigate.mockImplementation((navigate: () => void) => {
      pending = navigate;
      return false;
    });
    const { container } = await mount(createElement(WikiPageView, { initialPage: page, listPage: populatedList }));
    const pageButton = [...container.querySelectorAll("nav button")].find(
      (button) => button.textContent === page.title,
    );

    act(() => (pageButton as HTMLButtonElement).click());
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.store.load).not.toHaveBeenCalled();
    act(() => pending?.());
    expect(harness.store.load).toHaveBeenCalledExactlyOnceWith(page);
    expect(harness.push).toHaveBeenCalledExactlyOnceWith(`/wiki?page=${page.id}`);
  });

  it.each(["clean", "confirmed dirty"])(
    "prevents a new draft or edits while a %s page navigation is suspended",
    async (mode) => {
      configure(true, false);
      const nextPage = { ...page, id: "10000000-0000-4000-8000-000000000002", title: "Support knowledge" };
      const pages = { ...populatedList, items: [page, nextPage], total: 2 };
      let ready = false;
      let complete = () => {};
      const routeResponse = new Promise<void>((resolve) => {
        complete = resolve;
      });
      let confirmNavigation: (() => void) | undefined;
      if (mode === "confirmed dirty") {
        harness.tryNavigate.mockImplementation((navigate: () => void) => {
          confirmNavigation = navigate;
          return false;
        });
      }
      function Toolbar() {
        return createElement("header", null, useTopBarActions().actions);
      }
      function Route() {
        const [selected, setSelected] = useState(page);
        harness.push.mockImplementation(() => startTransition(() => setSelected(nextPage)));
        if (selected === nextPage && !ready) use(routeResponse);
        harness.store.form = selected;
        return createElement(WikiPageView, { key: selected.id, initialPage: selected, listPage: pages });
      }
      const { container } = await mount(
        createElement(TopBarActionsProvider, null, [
          createElement(Toolbar, { key: "toolbar" }),
          createElement(Suspense, { key: "route", fallback: "Incoming route" }, createElement(Route)),
        ]),
      );
      const pageButton = [...container.querySelectorAll<HTMLButtonElement>("nav button")].find(
        (button) => button.textContent === nextPage.title,
      );

      await act(async () => {
        pageButton?.click();
        await Promise.resolve();
      });
      if (mode === "confirmed dirty") {
        expect(harness.push).not.toHaveBeenCalled();
        expect(container.querySelector('input[aria-label="Wiki.pageTitle"]')).not.toBeNull();
        expect(container.querySelector('[aria-label="Wiki.newPage"]')).not.toBeNull();
        await act(async () => {
          confirmNavigation?.();
          await Promise.resolve();
        });
      }

      expect(harness.push).toHaveBeenCalledExactlyOnceWith(`/wiki?page=${nextPage.id}`);
      expect(container.querySelector('main [data-page-state="loading"]')).not.toBeNull();
      expect(container.querySelector('main [role="status"]')?.textContent).toBe("PageState.loading");
      expect(container.querySelector('input[aria-label="Wiki.pageTitle"]')).toBeNull();
      expect(container.querySelector("[data-editor-readonly]")).toBeNull();
      expect(container.querySelector('[aria-label="Wiki.newPage"]')).toBeNull();
      expect(container.querySelector('[aria-label="Wiki.save"]')).toBeNull();
      expect([...container.querySelectorAll<HTMLButtonElement>("nav button")].every((button) => button.disabled)).toBe(
        true,
      );
      expect(harness.store.startCreate).not.toHaveBeenCalled();

      await act(async () => {
        ready = true;
        complete();
        await routeResponse;
      });

      expect(container.querySelector('main [data-page-state="loading"]')).toBeNull();
      expect(container.querySelector('nav [aria-current="page"]')?.textContent).toBe(nextPage.title);
      expect(container.querySelector('input[aria-label="Wiki.pageTitle"]')).not.toBeNull();
      expect(container.querySelector('[data-editor-readonly="false"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="Wiki.newPage"]')).not.toBeNull();
    },
  );

  it("guards New and conflict reload with the same unsaved-changes boundary", async () => {
    configure(true, false);
    harness.store.form = page;
    harness.store.conflict = true;
    harness.store.hasUnsavedChanges = true;
    let pending: (() => void) | undefined;
    harness.tryNavigate.mockImplementation((navigate: () => void) => {
      pending = navigate;
      return false;
    });
    const { container } = await mount(createElement(WikiPageView, { initialPage: page, listPage: populatedList }));
    const { container: topBar } = await mount(harness.topBar);

    act(() => topBar.querySelector<HTMLButtonElement>('[aria-label="Wiki.newPage"]')?.click());
    expect(harness.store.startCreate).not.toHaveBeenCalled();
    act(() => pending?.());
    expect(harness.store.startCreate).toHaveBeenCalledOnce();

    act(() => container.querySelector<HTMLButtonElement>('[role="alert"] button')?.click());
    expect(harness.store.reload).not.toHaveBeenCalled();
    act(() => pending?.());
    expect(harness.store.reload).toHaveBeenCalledOnce();
  });

  it("focuses the blank title when starting a new document", async () => {
    configure(true, false);
    harness.store.creating = true;
    const { container } = await mount(createElement(WikiPageView, { initialPage: null, listPage }));

    expect(document.activeElement).toBe(container.querySelector('input[aria-label="Wiki.pageTitle"]'));
  });
});

afterEach(() => {
  act(() => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  for (const container of mountedContainers.splice(0)) container.remove();
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
    const { container, recoverableErrors, serverHtml } = await hydrate(true, true, null, true);

    expect(serverHtml).toContain("Wiki.emptyBodyManual");
    expect(serverHtml).not.toContain("data-wiki-homepage-setup");
    expect(recoverableErrors).toEqual([]);
    expect(container.innerHTML).toContain("Wiki.emptyBody");
    expect(container.innerHTML).toContain("data-wiki-homepage-setup");
    expect(container.innerHTML).toContain("Wiki.newPage");
    expect(harness.setupProps).not.toBeNull();

    await harness.setupProps?.onAccepted("conversation-1");

    expect(harness.open).toHaveBeenCalledOnce();
    expect(harness.loadConfig).toHaveBeenCalledOnce();
    expect(harness.selectConversation).toHaveBeenCalledExactlyOnceWith("conversation-1");
  });

  it("starts the first manual document with the conventional AGENTS.md filename", async () => {
    configure(true, false);
    const { container } = await mount(createElement(WikiPageView, { initialPage: null, listPage }));
    const manual = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Wiki.newPage"),
    );

    act(() => manual?.click());

    expect(harness.store.startCreate).toHaveBeenCalledExactlyOnceWith("AGENTS.md");
  });

  it("offers homepage setup on a first visit before chat availability has been loaded", async () => {
    const { container, recoverableErrors, serverHtml } = await hydrate(true, true, null, null);

    expect(serverHtml).not.toContain("data-wiki-homepage-setup");
    expect(recoverableErrors).toEqual([]);
    expect(container.innerHTML).toContain("data-wiki-homepage-setup");
    expect(harness.loadConfig).not.toHaveBeenCalled();
  });

  it.each([
    [false, true],
    [true, false],
  ])(
    "requires both deployment=%s and tenant=%s Agent availability for Mate setup",
    async (agentChatEnabled, agentEnabled) => {
      const { container, recoverableErrors } = await hydrate(true, agentChatEnabled, agentEnabled);

      expect(recoverableErrors).toEqual([]);
      expect(container.innerHTML).toContain("Wiki.emptyBodyManual");
      expect(container.innerHTML).not.toContain("data-wiki-homepage-setup");
    },
  );
});
