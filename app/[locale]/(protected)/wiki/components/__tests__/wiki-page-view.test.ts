import type * as TooltipModule from "@/components/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import type * as WikiPageStoreModule from "../wiki-page.store";
import type { WikiPageStore as RealWikiPageStore } from "../wiki-page.store";
import type { Root as ReactRoot } from "react-dom/client";
import type * as TopBarActionsModule from "@/app/components/topbar-actions-context";
import type { BaseFormStore } from "@/core/base/base-form.store";

import { act, cloneElement, createElement, isValidElement, startTransition, Suspense, use, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { observable, reaction, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  realStore: false,
  rootStore: {} as Record<string, unknown>,
  store: {} as Record<string, unknown>,
  pageChanged: null as null | ((pageId: string | null) => void),
  replace: vi.fn(),
  push: vi.fn(),
  topBar: null as ReactNode,
  toolbarRenders: 0,
  editorProps: null as null | {
    data?: object;
    onChange?: (value: object) => void;
  },
  refresh: vi.fn(),
  open: vi.fn(),
  loadConfig: vi.fn(),
  selectConversation: vi.fn(),
  openWithDraft: vi.fn(),
  refreshWhileSetupWorks: vi.fn(),
  p13nUpsert: vi.fn(),
  startSetup: vi.fn(),
  createWikiPages: vi.fn(),
  deleteWikiPage: vi.fn(),
  updateWikiPage: vi.fn(),
  tryNavigate: vi.fn((navigate: () => void) => {
    navigate();
    return true;
  }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/app/actions", () => ({ upsertP13nAction: harness.p13nUpsert }));
vi.mock("../../actions", () => ({
  startWikiHomepageSetupAction: harness.startSetup,
  createWikiPagesAction: harness.createWikiPages,
  deleteWikiPageAction: harness.deleteWikiPage,
  updateWikiPageAction: harness.updateWikiPage,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => harness.rootStore,
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement("a", props, children),
  usePathname: () => "/wiki",
  useRouter: () => ({
    replace: harness.replace,
    refresh: harness.refresh,
    push: harness.push,
  }),
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ map: () => ({}) }),
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
  useWikiPages: (result: { total: number; page: number; pageSize: number }) => ({
    result,
    hasMore: result.page * result.pageSize < result.total,
    totalIsExact: true,
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
vi.mock("@/components/ui/tooltip", async (importOriginal) => {
  const actual = await importOriginal<typeof TooltipModule>();
  return {
    ...actual,
    Tooltip: (props: React.ComponentProps<typeof actual.Tooltip>) =>
      createElement(actual.TooltipProvider, null, createElement(actual.Tooltip, props)),
  };
});
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children?: ReactNode }) => children,
  SheetTrigger: ({ children }: { children?: ReactNode }) => children,
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
    return createElement("div", {
      "data-editor-readonly": Boolean(props.readOnly),
    });
  },
}));
vi.mock("@/components/editor/editor.utils", () => ({
  parseMarkdownToJSON: (markdown: string) => ({ markdown }),
  serializeJSONToMarkdown: () => "",
}));
vi.mock("@/components/forms/form-context", async () => {
  const { useNavigationGuard } = await import("@/components/modal/use-navigation-guard");
  return {
    AppForm: function AppForm({ children, id, store }: { children?: ReactNode; id?: string; store: BaseFormStore }) {
      useNavigationGuard(store);
      return createElement("form", { id }, children);
    },
  };
});
vi.mock("@/components/forms/form-select", () => ({
  FormSelect: (props: { id: string; items?: Array<{ value: string; disabled?: boolean; description?: string }> }) =>
    createElement(
      "select",
      { "data-form-select": props.id },
      props.items?.map((item) =>
        createElement(
          "option",
          { key: item.value, disabled: item.disabled, "data-description": item.description },
          item.value,
        ),
      ),
    ),
}));
vi.mock("@/components/forms/form-textarea", () => ({
  FormTextarea: ({
    label: _label,
    containerClassName: _containerClassName,
    ...props
  }: {
    id: string;
    label?: unknown;
    containerClassName?: unknown;
  }) => createElement("textarea", { ...props, "data-form-textarea": props.id }),
}));
vi.mock("@/components/forms/form-input", () => ({
  FormInput: ({ label: _label, ...props }: { label?: unknown; [key: string]: unknown }) =>
    createElement("input", props),
}));
vi.mock("@/components/shared/icon", () => ({
  Icon: () => createElement("span"),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...props }: { children?: ReactNode; asChild?: boolean; [key: string]: unknown }) => {
    const buttonProps = {
      ...Object.fromEntries(Object.entries(props).filter(([name]) => !["size", "variant"].includes(name))),
      "data-variant": props.variant ?? "default",
    };
    return asChild && isValidElement(children)
      ? cloneElement(children, buttonProps)
      : createElement("button", buttonProps, children);
  },
}));
vi.mock("@/components/wiki/wiki-homepage-setup", () => ({
  useRefreshWhileWikiSetupWorks: harness.refreshWhileSetupWorks,
  EMPTY_WIKI_HOMEPAGE_SETUP_STATE: {
    status: "idle",
    homepage: null,
    domain: null,
    conversationId: null,
    pages: [],
  },
}));
vi.mock("../wiki-page.store", async (importOriginal) => {
  const actual = await importOriginal<typeof WikiPageStoreModule>();
  return {
    WikiPageStore: function WikiPageStore(...args: ConstructorParameters<typeof actual.WikiPageStore>) {
      harness.pageChanged = args[2] ?? null;
      if (harness.realStore) harness.store = new actual.WikiPageStore(...args) as unknown as Record<string, unknown>;
      return harness.store;
    },
  };
});

import { WikiPageStore } from "../wiki-page.store";
import { WikiRouteScope } from "../wiki-route-scope";

import { resolveWikiPageState } from "../wiki-page-state";
import { WikiPageView } from "../wiki-page-view";
import { TopBarActionsProvider, useTopBarActions } from "@/app/components/topbar-actions-context";
import { NavigationGuardController } from "@/core/stores/navigation-guard.controller";

const listPage = { items: [], total: 0, page: 1, pageSize: 25 };
const page = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Company knowledge",
  markdown: "Our documented process.",
  kind: "knowledge" as const,
  whenToUse: null,

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
    form: {
      id: null,
      title: "",
      markdown: "",
      kind: "knowledge",
      whenToUse: "",

      updatedAt: null,
    },
    isLoading: false,
    hasUnsavedChanges: false,
    editorDocument: { type: "doc", content: [{ type: "paragraph" }] },
    onEditorChange: vi.fn(),
    receivePage: vi.fn(),
    initializeServerPage: vi.fn(),
    receiveServerPage: (snapshot: unknown) => (harness.store.receivePage as (value: unknown) => void)(snapshot),
    releaseView: vi.fn(),
    attachOnChanged: (callback: (pageId: string | null) => void) => {
      harness.pageChanged = callback;
      return () => {
        if (harness.pageChanged === callback) harness.pageChanged = null;
      };
    },

    load: vi.fn(),
    reload: vi.fn(),
    resetForm: vi.fn(),
    resetDocument: vi.fn(),
    startCreate: vi.fn(),
  };
  harness.rootStore = {
    agentChatEnabled,
    cachedWikiStore: null as RealWikiPageStore | null,
    get wikiPageStore(): unknown {
      if (harness.realStore && !this.cachedWikiStore)
        this.cachedWikiStore = new WikiPageStore(harness.rootStore as never, null);
      return harness.realStore ? this.cachedWikiStore : harness.store;
    },
    agentChatStore: {
      enabled: agentEnabled,
      isWorking: false,
      historyMutationPending: null,
      conversationId: null,
      open: harness.open,
      loadConfig: harness.loadConfig,
      selectConversation: harness.selectConversation,
      openWithDraft: harness.openWithDraft,
      composerDraft: "",
      composerContexts: [],
    },
    navigationGuard: {
      register: vi.fn(),
      unregister: vi.fn(),
      tryNavigate: harness.tryNavigate,
      requestRouteRefreshWhenSafe: (refresh: () => void) => refresh(),
    },
    userStore: { can: () => canManage, user: { id: "user-1" } },
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
  harness.realStore = false;
  harness.pageChanged = null;
  harness.tryNavigate.mockImplementation((navigate: () => void) => {
    navigate();
    return true;
  });
  harness.topBar = null;
  harness.toolbarRenders = 0;
  harness.loadConfig.mockResolvedValue("ready");
  harness.updateWikiPage.mockReset().mockResolvedValue({ ok: true, data: page });
  harness.createWikiPages.mockReset().mockResolvedValue({ ok: true, data: [page] });
  harness.deleteWikiPage.mockReset().mockResolvedValue({ ok: true, data: page });
  harness.selectConversation.mockResolvedValue(undefined);
  harness.p13nUpsert.mockResolvedValue({
    ok: true,
    data: { p13nId: "wiki-layout", columnWidths: {} },
  });
});

describe("Wiki document view", () => {
  it.each(["Reset", "Save"] as const)(
    "keeps a queued refresh blocked after the inner form unmounts until %s succeeds",
    async (release) => {
      configure(true, true, true);
      harness.realStore = true;
      harness.rootStore.userStore = { canManage: () => true, user: { id: "user-1" } };
      const navigationGuard = new NavigationGuardController();
      harness.rootStore.navigationGuard = navigationGuard;
      const { container, root } = await mount(
        createElement(WikiPageView, { initialPage: page, requestedPageId: page.id, listPage: populatedList }),
      );
      const store = harness.store as unknown as RealWikiPageStore;
      act(() => {
        store.onChange("title", "Unsaved manual title");
        store.onChange("markdown", "Unsaved manual body");
      });
      const firstRefresh = vi.fn();
      const refresh = vi.fn();
      act(() => {
        navigationGuard.requestRouteRefreshWhenSafe(firstRefresh);
        navigationGuard.requestRouteRefreshWhenSafe(refresh);
        store.setUnavailable();
      });
      expect(container.querySelector("form")).toBeNull();
      expect(navigationGuard.isRouteRefreshBlocked).toBe(true);
      expect(firstRefresh).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(store.form).toMatchObject({ title: "Unsaved manual title", markdown: "Unsaved manual body" });

      if (release === "Reset") {
        act(() => store.resetDocument());
        expect(store.form).toMatchObject({ title: page.title, markdown: page.markdown });
      } else {
        act(() =>
          runInAction(() => {
            store.unavailable = false;
          }),
        );
        expect(refresh).not.toHaveBeenCalled();
        const saved = {
          ...page,
          title: "Unsaved manual title",
          markdown: "Unsaved manual body",
          updatedAt: new Date("2026-10-03T00:00:00.000Z"),
        };
        let finish!: (result: { ok: true; data: typeof saved }) => void;
        harness.updateWikiPage.mockImplementation(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        );
        let submitted!: Promise<void>;
        await act(async () => {
          submitted = store.onSubmit();
          await Promise.resolve();
        });
        expect(harness.updateWikiPage).toHaveBeenCalledExactlyOnceWith({
          id: page.id,
          expectedUpdatedAt: page.updatedAt,
          title: saved.title,
          markdown: saved.markdown,
          kind: page.kind,
          whenToUse: undefined,
        });
        expect(store.isLoading).toBe(true);
        expect(refresh).not.toHaveBeenCalled();
        await act(async () => {
          finish({ ok: true, data: saved });
          await submitted;
        });
        expect(store.form).toMatchObject({ title: saved.title, markdown: saved.markdown, updatedAt: saved.updatedAt });
      }
      expect(store.hasUnsavedChanges).toBe(false);
      expect(navigationGuard.isRouteRefreshBlocked).toBe(false);
      expect(firstRefresh).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledOnce();
      act(() => root.render(null));
      expect(refresh).toHaveBeenCalledOnce();
    },
  );

  it("releases a pending refresh when the final Wiki view owner unmounts", async () => {
    configure(true, true, true);
    harness.realStore = true;
    harness.rootStore.userStore = { canManage: () => true, user: { id: "user-1" } };
    const navigationGuard = new NavigationGuardController();
    harness.rootStore.navigationGuard = navigationGuard;
    const { root } = await mount(
      createElement(WikiPageView, { initialPage: page, requestedPageId: page.id, listPage: populatedList }),
    );
    const store = harness.store as unknown as RealWikiPageStore;
    act(() => {
      store.onChange("title", "Unsaved manual title");
      store.setUnavailable();
    });
    const refresh = vi.fn();
    act(() => navigationGuard.requestRouteRefreshWhenSafe(refresh));
    expect(navigationGuard.isGuarding).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    act(() => root.render(null));
    expect(navigationGuard.isGuarding).toBe(false);
    expect(navigationGuard.isRouteRefreshBlocked).toBe(false);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps a capture-phase rail navigation on Cancel and loads the new route only after Discard", async () => {
    configure(true, true, true);
    harness.realStore = true;
    harness.rootStore.userStore = { canManage: () => true, user: { id: "user-1" } };
    const navigationGuard = new NavigationGuardController();
    harness.rootStore.navigationGuard = navigationGuard;
    const replacement = {
      ...page,
      id: "10000000-0000-4000-8000-000000000002",
      title: "Selected destination",
      markdown: "Destination body",
    };
    const pages = { ...populatedList, items: [page, replacement], total: 2 };
    const previousUrl = window.location.href;
    const { root, container } = await mount(
      createElement(WikiPageView, { initialPage: page, requestedPageId: page.id, listPage: pages }),
    );
    const store = harness.store as unknown as RealWikiPageStore;
    const editor = container.querySelector("[data-editor-readonly]");
    const selected = vi.fn();
    const disposeSelection = reaction(
      () => store.form.id,
      (id) => selected(id),
    );
    const destination = container.querySelector<HTMLAnchorElement>(`nav a[href="/wiki?page=${replacement.id}"]`);
    expect(destination).not.toBeNull();
    window.history.replaceState({}, "", `/en/wiki?page=${page.id}`);
    harness.push.mockImplementation((path: string) => window.history.pushState({}, "", path));
    try {
      act(() => {
        store.onChange("title", "Unsaved manual title");
        store.onChange("markdown", "Unsaved manual body");
        destination?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      });
      expect(navigationGuard.isPending).toBe(true);
      expect(harness.push).not.toHaveBeenCalled();
      expect(selected).not.toHaveBeenCalled();
      act(() => navigationGuard.cancel());
      expect(window.location.pathname + window.location.search).toBe(`/en/wiki?page=${page.id}`);
      expect(store.form).toMatchObject({ id: page.id, title: "Unsaved manual title", markdown: "Unsaved manual body" });
      expect(container.querySelector("[data-editor-readonly]")).toBe(editor);
      expect(store.hasUnsavedChanges).toBe(true);

      act(() => {
        destination?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      });
      expect(navigationGuard.isPending).toBe(true);
      act(() => navigationGuard.confirm());
      expect(harness.push).toHaveBeenCalledExactlyOnceWith(`/wiki?page=${replacement.id}`);
      expect(window.location.search).toBe(`?page=${replacement.id}`);
      expect(store.hasUnsavedChanges).toBe(true);
      expect(selected).not.toHaveBeenCalled();
      act(() =>
        root.render(
          createElement(WikiPageView, {
            initialPage: replacement,
            requestedPageId: replacement.id,
            listPage: pages,
          }),
        ),
      );
      expect(selected).toHaveBeenCalledExactlyOnceWith(replacement.id);
      expect(store.form).toMatchObject({
        id: replacement.id,
        title: replacement.title,
        markdown: replacement.markdown,
      });
      expect(store.hasUnsavedChanges).toBe(false);
      expect(navigationGuard.isPending).toBe(false);
    } finally {
      disposeSelection();
      harness.push.mockReset();
      window.history.replaceState({}, "", previousUrl);
    }
  });

  it("retains the editor while a saved page refresh is suspended", async () => {
    configure(true, false);
    harness.store.form = page;
    let ready = false;
    let complete = () => {};
    const response = new Promise<void>((resolve) => {
      complete = resolve;
    });
    function Toolbar() {
      return createElement("header", null, useTopBarActions().actions);
    }
    function Route() {
      const [refreshing, setRefreshing] = useState(false);
      harness.refresh.mockImplementation(() => startTransition(() => setRefreshing(true)));
      if (refreshing && !ready) use(response);
      return createElement(WikiPageView, { initialPage: page, listPage: populatedList });
    }
    const { container } = await mount(
      createElement(TopBarActionsProvider, null, [
        createElement(Toolbar, { key: "toolbar" }),
        createElement(
          WikiRouteScope,
          { key: "route" },
          createElement(Suspense, { fallback: "Incoming route" }, createElement(Route)),
        ),
      ]),
    );
    const editor = container.querySelector("[data-editor-readonly]");
    await act(async () => {
      harness.pageChanged?.(page.id);
      await Promise.resolve();
    });
    expect(harness.replace).toHaveBeenCalledExactlyOnceWith(`/wiki?page=${page.id}`);
    expect(harness.refresh).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-editor-readonly]")).toBe(editor);
    expect(container.querySelector('#wiki-document-panel [data-page-state="loading"]')).toBeNull();
    expect(container.querySelector('[aria-label="Wiki.newPage"]')).not.toBeNull();
    await act(async () => {
      ready = true;
      complete();
      await response;
    });
    expect(container.querySelector("[data-editor-readonly]")).toBe(editor);
  });

  it("preserves edits made after creating a page while its route response is delayed", async () => {
    configure(true, false);
    harness.realStore = true;
    harness.rootStore.userStore = { canManage: () => true, user: { id: "user-1" } };
    const { root } = await mount(
      createElement(WikiPageView, { initialPage: page, requestedPageId: page.id, listPage: populatedList }),
    );
    const store = harness.store as unknown as RealWikiPageStore;
    const created = { ...page, id: "10000000-0000-4000-8000-000000000002", title: "Saved new page" };
    act(() => store.load(created));
    act(() => store.onChange("title", "Additional edit"));
    const document = store.editorDocument;
    act(() =>
      root.render(
        createElement(WikiPageView, {
          initialPage: created,
          requestedPageId: created.id,
          listPage: populatedList,
        }),
      ),
    );
    expect(store.form.id).toBe(created.id);
    expect(store.form.title).toBe("Additional edit");
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.editorDocument).toBe(document);
  });

  it("preserves the real dirty store and document instance when refreshed props finish a crawl", async () => {
    configure(true, true, true);
    harness.realStore = true;
    harness.rootStore.userStore = { canManage: () => true, user: { id: "user-1" } };
    const state = {
      status: "working" as const,
      homepage: "https://example.com/",
      domain: "example.com",
      conversationId: null,
      pages: [page],
      progress: { fetched: 20, total: 60 },
    };
    const { root, container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
        initialSetupState: state,
      }),
    );
    const store = harness.store as unknown as RealWikiPageStore;
    act(() => store.onChange("title", "Unsaved manual title"));
    expect(store.hasUnsavedChanges).toBe(true);
    const input = container.querySelector("textarea#title");
    const remote = {
      ...page,
      title: "Remote refreshed title",
      markdown: "Remote body",
      updatedAt: new Date("2026-09-29"),
    };
    act(() =>
      root.render(
        createElement(WikiPageView, {
          initialPage: remote,
          listPage: { ...populatedList, items: [remote] },
          initialSetupState: { ...state, status: "completed" },
        }),
      ),
    );
    expect(harness.store).toBe(store);
    expect(container.querySelector("textarea#title")).toBe(input);
    expect(store.form.title).toBe("Unsaved manual title");
    expect(store.form.markdown).toBe(page.markdown);
    expect(store.hasUnsavedChanges).toBe(true);
    const replacement = { ...remote, id: "10000000-0000-4000-8000-000000000002" };
    for (const snapshot of [replacement, null]) {
      act(() =>
        root.render(
          createElement(WikiPageView, {
            initialPage: snapshot,
            listPage: populatedList,
            unavailable: snapshot === null,
          }),
        ),
      );
      expect(store.form.title).toBe("Unsaved manual title");
      expect(store.form.id).toBe(page.id);
      expect(container.querySelector("textarea#title")).toBe(input);
    }
    act(() =>
      root.render(
        createElement(WikiPageView, {
          initialPage: replacement,
          requestedPageId: replacement.id,
          listPage: populatedList,
        }),
      ),
    );
    expect(store.form.id).toBe(replacement.id);
    expect(store.hasUnsavedChanges).toBe(false);
    act(() => store.onChange("title", "Another edit"));
    act(() =>
      root.render(
        createElement(WikiPageView, {
          initialPage: page,
          listPage: populatedList,
        }),
      ),
    );
    expect(store.form.id).toBe(page.id);
    expect(store.form.title).toBe(page.title);
    expect(store.hasUnsavedChanges).toBe(false);
  });
  it("applies a completed refresh after Reset without another poll and preserves newer saved revisions", async () => {
    configure(true, true, true);
    harness.realStore = true;
    harness.rootStore.userStore = { canManage: () => true, user: { id: "user-1" } };
    const { root } = await mount(createElement(WikiPageView, { initialPage: page, listPage: populatedList }));
    const store = harness.store as unknown as RealWikiPageStore;
    act(() => store.onChange("title", "Unsaved manual title"));
    const remote = {
      ...page,
      title: "Completed refresh",
      markdown: "Refreshed body",
      updatedAt: new Date("2026-09-29"),
    };
    act(() =>
      root.render(
        createElement(WikiPageView, {
          initialPage: remote,
          listPage: populatedList,
          initialSetupState: {
            status: "completed",
            homepage: null,
            domain: null,
            conversationId: null,
            pages: [remote],
          },
        }),
      ),
    );
    expect(store.form.title).toBe("Unsaved manual title");
    expect(harness.refreshWhileSetupWorks).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed" }));
    act(() => store.resetDocument());
    expect(store.form.title).toBe(remote.title);
    expect(store.form.markdown).toBe(remote.markdown);
    expect(store.hasUnsavedChanges).toBe(false);
    expect(harness.refresh).not.toHaveBeenCalled();
    act(() => store.onChange("title", "Saved later"));
    act(() => store.setIsLoading(true));
    const saved = { ...remote, title: "Saved later", updatedAt: new Date("2026-09-30") };
    act(() => store.load(saved));
    expect(store.form.title).toBe(saved.title);
    expect(store.form.updatedAt).toEqual(saved.updatedAt);
    expect(store.hasUnsavedChanges).toBe(false);
    act(() => store.startCreate("New page"));
    const created = { ...saved, id: "10000000-0000-4000-8000-000000000003", title: "New page" };
    act(() => store.load(created));
    expect(store.form.id).toBe(created.id);
    expect(store.form.title).toBe(created.title);
  });

  it("renders real document padding, a container-aware outline, and an accessible wide-layout divider", async () => {
    configure(true, false);
    harness.store.form = page;
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        layoutInitial: {
          "panel:pages-document:pages": 280,
          "panel:pages-document:document": 720,
        },
        listPage: populatedList,
      }),
    );
    const layout = container.querySelector<HTMLElement>("[data-wiki-document-layout]");
    const group = container.querySelector<HTMLElement>("[data-resizable-panel-group]");
    const handle = container.querySelector<HTMLButtonElement>('[role="separator"]');

    expect(layout?.className.split(" ")).toEqual(expect.arrayContaining(["px-6", "py-8", "md:px-10", "md:py-10"]));
    expect(layout?.closest("form")?.className).toBe("");
    const documentPanel = container.querySelector("#wiki-document-panel");
    expect(documentPanel?.tagName).toBe("SECTION");
    expect(documentPanel?.getAttribute("aria-label")).toBe("Wiki.document");
    expect(documentPanel?.className).toContain("@container/wiki");
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("aside")?.className).toContain("lg:flex");
    expect(group?.className).toContain("lg:grid-cols-[var(--panel-grid-template)]");
    expect(group?.style.getPropertyValue("--panel-grid-template")).toContain("280px");
    expect(handle?.getAttribute("aria-controls")).toBe("wiki-pages-panel wiki-document-panel");
    expect(handle?.parentElement?.className).toContain("lg:flex");
  });

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
        createElement(WikiPageView, {
          key: "wiki",
          initialPage: page,
          listPage: populatedList,
        }),
      ]),
    );
    const save = () => container.querySelector<HTMLButtonElement>('header [aria-label="Common.actions.save"]');
    expect(save()).toBeNull();
    expect(
      container
        .querySelector("header")
        ?.querySelectorAll("button")
        .item((container.querySelector("header")?.querySelectorAll("button").length ?? 0) - 1)
        ?.getAttribute("aria-label"),
    ).toBe("Wiki.newPage");
    expect(container.querySelector('header [aria-label="Wiki.newPage"]')?.getAttribute("data-variant")).toBe("default");
    expect(harness.toolbarRenders).toBeLessThan(10);
    const settledRenders = harness.toolbarRenders;

    act(() =>
      runInAction(() => {
        harness.store.hasUnsavedChanges = true;
      }),
    );
    expect(save()?.disabled).toBe(false);
    expect(
      container
        .querySelector("header")
        ?.querySelectorAll("button")
        .item((container.querySelector("header")?.querySelectorAll("button").length ?? 0) - 1),
    ).toBe(save());
    expect(container.querySelector('header [aria-label="Wiki.newPage"]')).toBeNull();
    expect(container.querySelector('header [aria-label="Wiki.pageActions"]')).toBeNull();
    expect(container.querySelector('header [aria-label="Common.actions.reset"]')).not.toBeNull();
    expect(container.querySelector('header [aria-label="Common.actions.reset"]')?.getAttribute("data-variant")).toBe(
      "secondary",
    );
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
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
      }),
    );
    const { container: topBar } = await mount(harness.topBar);
    const form = container.querySelector("form");
    const save = topBar.querySelector<HTMLButtonElement>('[aria-label="Common.actions.save"]');

    expect(container.querySelector('[data-editor-readonly="false"]')).not.toBeNull();
    expect(harness.editorProps?.data).toBe(harness.store.editorDocument);
    expect(harness.editorProps?.onChange).toBe(harness.store.onEditorChange);
    expect(container.querySelector('textarea[aria-label="Wiki.pageTitle"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Wiki.edit");
    expect(save?.disabled).toBe(false);
    expect(save?.getAttribute("type")).toBe("submit");
    expect(save?.getAttribute("form")).toBe(form?.id);

    act(() => topBar.querySelector<HTMLButtonElement>('[aria-label="Common.actions.reset"]')?.click());
    expect(harness.store.resetDocument).toHaveBeenCalledOnce();
  });

  it("keeps the dirty document, conflict, and editor instance while resizing", async () => {
    configure(true, false);
    harness.store.form = page;
    harness.store.hasUnsavedChanges = true;
    harness.store.conflict = true;
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
      }),
    );
    const editor = container.querySelector('[data-editor-readonly="false"]');
    const handle = container.querySelector<HTMLButtonElement>('[role="separator"]');

    act(() => {
      handle?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowRight",
        }),
      );
    });

    expect(container.querySelector('[data-editor-readonly="false"]')).toBe(editor);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(harness.store.hasUnsavedChanges).toBe(true);
    expect(harness.store.load).not.toHaveBeenCalled();
    expect(harness.store.resetDocument).not.toHaveBeenCalled();
    expect(harness.store.onEditorChange).not.toHaveBeenCalled();
  });

  it("renders readers without edit, Save, or New controls", () => {
    configure(false, false);
    harness.store.form = page;
    const html = renderToStaticMarkup(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
      }),
    );
    const topBar = renderToStaticMarkup(harness.topBar);

    expect(html).toContain('data-editor-readonly="true"');
    expect(html).toContain(`<h1 class="break-words text-3xl font-semibold tracking-tight">${page.title}</h1>`);
    expect(html).not.toContain('aria-label="Wiki.pageTitle"');
    expect(topBar).not.toContain("Common.actions.save");
    expect(topBar).not.toContain("Wiki.newPage");
  });

  it("pins a selected page outside the current list page without changing pagination", async () => {
    configure(false, false);
    const selected = {
      ...page,
      id: "10000000-0000-4000-8000-000000000099",
      title: "Support",
    };
    const firstPage = Array.from({ length: 25 }, (_, index) => ({
      ...page,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      title: `Page ${index + 1}`,
    }));
    const paginated = { ...listPage, items: firstPage, total: 26 };
    harness.store.form = selected;

    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: selected,
        listPage: paginated,
        pinnedPage: selected,
      }),
    );

    expect(container.querySelectorAll("nav a")).toHaveLength(26);
    expect(container.querySelector('nav [aria-current="page"]')?.textContent).toBe("Support");
    expect(container.textContent).toContain("Wiki.page");
  });

  it("shows an unavailable target without substituting a document or offering homepage setup", () => {
    configure(true, true);
    const html = renderToStaticMarkup(
      createElement(WikiPageView, {
        initialPage: null,
        listPage: populatedList,
        unavailable: true,
      }),
    );

    expect(html).toContain("Wiki.unavailableTitle");
    expect(html).not.toContain("data-editor-readonly");
    expect(html).not.toContain("Wiki.emptyTitle");
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
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
      }),
    );
    const pageButton = [...container.querySelectorAll("nav a")].find((button) => button.textContent === page.title);

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
      const nextPage = {
        ...page,
        id: "10000000-0000-4000-8000-000000000002",
        title: "Support knowledge",
      };
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
        return createElement(WikiPageView, {
          key: selected.id,
          initialPage: selected,
          listPage: pages,
        });
      }
      const { container } = await mount(
        createElement(TopBarActionsProvider, null, [
          createElement(Toolbar, { key: "toolbar" }),
          createElement(Suspense, { key: "route", fallback: "Incoming route" }, createElement(Route)),
        ]),
      );
      const pageButton = [...container.querySelectorAll<HTMLAnchorElement>("nav a")].find(
        (button) => button.textContent === nextPage.title,
      );

      await act(async () => {
        pageButton?.click();
        await Promise.resolve();
      });
      if (mode === "confirmed dirty") {
        expect(harness.push).not.toHaveBeenCalled();
        expect(container.querySelector('textarea[aria-label="Wiki.pageTitle"]')).not.toBeNull();
        expect(container.querySelector('[aria-label="Wiki.newPage"]')).not.toBeNull();
        await act(async () => {
          confirmNavigation?.();
          await Promise.resolve();
        });
      }

      expect(harness.push).toHaveBeenCalledExactlyOnceWith(`/wiki?page=${nextPage.id}`);
      expect(container.querySelector('#wiki-document-panel [data-page-state="loading"]')).not.toBeNull();
      expect(container.querySelector('#wiki-document-panel [role="status"]')?.textContent).toBe("PageState.loading");
      expect(container.querySelector('textarea[aria-label="Wiki.pageTitle"]')).toBeNull();
      expect(container.querySelector("[data-editor-readonly]")).toBeNull();
      expect(container.querySelector('[aria-label="Wiki.newPage"]')).toBeNull();
      expect(container.querySelector('[aria-label="Common.actions.save"]')).toBeNull();
      expect(
        [...container.querySelectorAll<HTMLAnchorElement>("nav a")].every(
          (link) => link.getAttribute("aria-disabled") === "true",
        ),
      ).toBe(true);
      expect(harness.store.startCreate).not.toHaveBeenCalled();

      await act(async () => {
        ready = true;
        complete();
        await routeResponse;
      });

      expect(container.querySelector('#wiki-document-panel [data-page-state="loading"]')).toBeNull();
      expect(container.querySelector('nav [aria-current="page"]')?.textContent).toBe(nextPage.title);
      expect(container.querySelector('textarea[aria-label="Wiki.pageTitle"]')).not.toBeNull();
      expect(container.querySelector('[data-editor-readonly="false"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="Wiki.newPage"]')).not.toBeNull();
    },
  );

  it("hides New while dirty and guards conflict reload with the unsaved-changes boundary", async () => {
    configure(true, false);
    harness.store.form = page;
    harness.store.conflict = true;
    harness.store.hasUnsavedChanges = true;
    let pending: (() => void) | undefined;
    harness.tryNavigate.mockImplementation((navigate: () => void) => {
      pending = navigate;
      return false;
    });
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
      }),
    );
    const { container: topBar } = await mount(harness.topBar);

    expect(topBar.querySelector('[aria-label="Wiki.newPage"]')).toBeNull();
    expect(topBar.querySelector('[aria-label="Wiki.pageActions"]')).toBeNull();
    expect(harness.store.startCreate).not.toHaveBeenCalled();

    act(() => container.querySelector<HTMLButtonElement>('[role="alert"] button')?.click());
    expect(harness.store.reload).not.toHaveBeenCalled();
    act(() => pending?.());
    expect(harness.store.reload).toHaveBeenCalledOnce();
  });

  it("renders rail pages as links to their Wiki URL and leaves a true-empty rail blank", async () => {
    configure(false, false);
    harness.store.form = page;
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
      }),
    );
    const link = container.querySelector<HTMLAnchorElement>("nav a");

    expect(link?.getAttribute("href")).toBe(`/wiki?page=${page.id}`);
    expect(link?.getAttribute("aria-current")).toBe("page");

    configure(true, false);
    const { container: empty } = await mount(createElement(WikiPageView, { initialPage: null, listPage }));
    expect(empty.querySelector("nav")?.textContent).toBe("");
  });

  it("cancels a new draft back to the page it started from through the unsaved-changes guard", async () => {
    configure(true, false);
    harness.store.creating = true;
    let pending: (() => void) | undefined;
    harness.tryNavigate.mockImplementation((navigate: () => void) => {
      pending = navigate;
      return false;
    });
    await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
      }),
    );
    const { container: topBar } = await mount(harness.topBar);

    act(() => topBar.querySelector<HTMLButtonElement>('[aria-label="Common.actions.cancel"]')?.click());
    expect(harness.store.load).not.toHaveBeenCalled();
    act(() => pending?.());
    expect(harness.store.load).toHaveBeenCalledExactlyOnceWith(page);
  });

  it("shows a stale update as the shared warning alert with a Reload action", async () => {
    configure(true, false);
    harness.store.form = page;
    harness.store.conflict = true;
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
      }),
    );
    const alert = container.querySelector('[data-slot="alert"]');

    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toContain("Wiki.conflict");
    expect(alert?.querySelector("button")?.textContent).toBe("Wiki.reload");
  });

  it("lets managers type a page, asks procedures for a trigger, and blocks a second Operating Guide", async () => {
    configure(true, false);
    const guide = {
      ...page,
      id: "10000000-0000-4000-8000-000000000009",
      title: "Operating Guide",
      kind: "guide" as const,
    };
    harness.store.form = {
      ...page,
      kind: "procedure",
      whenToUse: "Refund requests",
    };
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: { ...listPage, items: [guide, page], total: 2 },
      }),
    );

    const options = Array.from(container.querySelectorAll('select[data-form-select="kind"] option'));
    expect(options.map((option) => option.textContent)).toEqual(["guide", "procedure", "knowledge"]);
    expect(options.find((option) => option.textContent === "guide")?.hasAttribute("disabled")).toBe(true);
    expect(options.map((option) => option.getAttribute("data-description"))).toEqual([
      "Wiki.kind.guideExists",
      "Wiki.kind.procedureDescription",
      "Wiki.kind.knowledgeDescription",
    ]);
    expect(container.querySelector('textarea[data-form-textarea="whenToUse"]')).not.toBeNull();
  });

  it("shows saved pages without publication controls and shows readers the page type", async () => {
    configure(true, false);
    harness.store.form = { ...page, kind: "guide", whenToUse: "" };
    const managed = await mount(createElement(WikiPageView, { initialPage: page, listPage: populatedList }));
    expect(managed.container.textContent).not.toContain("Wiki.draft");
    expect(managed.container.querySelector('[data-slot="alert"]')).toBeNull();
    expect(managed.container.querySelector('textarea[data-form-textarea="whenToUse"]')).toBeNull();

    configure(false, false);
    harness.store.form = {
      ...page,
      kind: "procedure",
      whenToUse: "Refund requests",
    };
    const readOnly = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
      }),
    );
    expect(readOnly.container.textContent).toContain("Wiki.kind.procedure: Refund requests");
    expect(readOnly.container.querySelector('select[data-form-select="kind"]')).toBeNull();
  });

  it("focuses the blank title when starting a new document", async () => {
    configure(true, false);
    harness.store.creating = true;
    const { container } = await mount(createElement(WikiPageView, { initialPage: null, listPage }));

    expect(document.activeElement).toBe(container.querySelector('textarea[aria-label="Wiki.pageTitle"]'));
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
    expect(html).not.toContain("Wiki.newPage");
  });

  it("offers only the manual new-page action without Mate suggestions when Mate is unavailable", () => {
    const html = render(true, true, false);

    expect(html).toContain("Wiki.emptyBody");
    expect(html).toContain("Wiki.newPage");
    expect(html).not.toContain("empty-page-agent-suggestions");
  });

  it("shows three Mate suggestion actions instead of the manual new-page action once hydrated", async () => {
    const { container, recoverableErrors, serverHtml } = await hydrate(true, true, null, true);

    expect(serverHtml).toContain("Wiki.emptyBody");
    expect(serverHtml).toContain("Wiki.newPage");
    expect(recoverableErrors).toEqual([]);
    expect(container.querySelector('[data-testid="empty-page-agent-suggestions"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="empty-page-agent-suggestions"] button')).toHaveLength(3);
    expect(container.textContent).not.toContain("Wiki.newPage");
  });

  it("starts an ordinary Mate chat from the website action instead of a bespoke panel", async () => {
    const { container } = await hydrate(true, true, null, true);
    const firstAction = container.querySelector<HTMLButtonElement>(
      '[data-testid="empty-page-agent-suggestions"] button',
    );

    expect(firstAction?.textContent).toContain("AgentChat.suggestions.pages.wiki.empty.first-wiki-page.label");
    act(() => firstAction?.click());

    expect(harness.openWithDraft).toHaveBeenCalledExactlyOnceWith(
      "AgentChat.suggestions.pages.wiki.empty.first-wiki-page.prompt",
    );
    expect(container.innerHTML).not.toContain("wiki-homepage");
  });

  it("starts the first manual document as a blank draft", async () => {
    configure(true, false);
    const { container } = await mount(createElement(WikiPageView, { initialPage: null, listPage }));
    const manual = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Wiki.newPage"),
    );

    act(() => manual?.click());

    expect(harness.store.startCreate).toHaveBeenCalledExactlyOnceWith();
  });

  it("hides every New page entry point while homepage setup is active", async () => {
    configure(true, true, true);
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: null,
        initialSetupState: {
          status: "working",
          homepage: "https://example.com/",
          domain: "example.com",
          conversationId: "conversation-1",
          pages: [],
        },
        listPage,
      }),
    );
    const { container: topBar } = await mount(harness.topBar);

    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>("#wiki-document-panel button")]
        .find((button) => button.textContent?.includes("WikiSetup.openTask"))
        ?.click();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain("Wiki.newPage");
    expect(topBar.querySelector('[aria-label="Wiki.newPage"]')).toBeNull();
    expect(harness.store.startCreate).not.toHaveBeenCalled();
    expect(harness.open).toHaveBeenCalledOnce();
    expect(harness.loadConfig).toHaveBeenCalledOnce();
    expect(harness.selectConversation).toHaveBeenCalledExactlyOnceWith("conversation-1");
  });

  it("does not offer a competing manual page while an active setup cannot be opened", async () => {
    configure(true, true, false);
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: null,
        initialSetupState: {
          status: "working",
          homepage: "https://example.com/",
          domain: "example.com",
          conversationId: "conversation-1",
          pages: [],
        },
        listPage,
      }),
    );
    const { container: topBar } = await mount(harness.topBar);

    expect(container.textContent).not.toContain("Wiki.newPage");
    expect(topBar.querySelector('[aria-label="Wiki.newPage"]')).toBeNull();
  });

  it("keeps the manual fallback until Mate availability has loaded", async () => {
    const { container, recoverableErrors, serverHtml } = await hydrate(true, true, null, null);

    expect(serverHtml).toContain("Wiki.newPage");
    expect(recoverableErrors).toEqual([]);
    expect(container.textContent).toContain("Wiki.newPage");
    expect(container.innerHTML).not.toContain("empty-page-agent-suggestions");
    expect(harness.loadConfig).not.toHaveBeenCalled();
  });

  it("uses the manual fallback when the tenant has Mate disabled", async () => {
    const { container, recoverableErrors } = await hydrate(true, true, false);

    expect(recoverableErrors).toEqual([]);
    expect(container.innerHTML).toContain("Wiki.emptyBody");
    expect(container.textContent).toContain("Wiki.newPage");
    expect(container.innerHTML).not.toContain("empty-page-agent-suggestions");
  });

  it("offers readers the read-only Mate actions and no creation fallback", async () => {
    const { container, recoverableErrors, serverHtml } = await hydrate(false, true, null, true);

    expect(serverHtml).toContain("Wiki.emptyBodyReadOnly");
    expect(serverHtml).not.toContain("Wiki.newPage");
    expect(recoverableErrors).toEqual([]);
    const chips = container.querySelectorAll('[data-testid="empty-page-agent-suggestions"] button');
    expect(chips).toHaveLength(3);
    expect(chips[0]?.textContent).toContain("AgentChat.suggestions.readOnly.explain.label");
    expect(container.querySelector('form, input[type="url"]')).toBeNull();
  });

  it("does not offer a website refresh for imported pages", async () => {
    configure(true, true, true);
    harness.store.form = { ...page };
    await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage: populatedList,
        initialSetupState: {
          status: "completed",
          homepage: "https://example.com/",
          domain: "example.com",
          conversationId: null,
          pages: [page],
          refreshable: true,
        },
      }),
    );
    expect((harness.topBar as ReactElement<Record<string, unknown>>).props).not.toHaveProperty("onRefreshFromWebsite");
    const { container } = await mount(harness.topBar);
    expect(container.textContent).not.toContain("Wiki.refreshFromWebsite");
    expect(harness.startSetup).not.toHaveBeenCalled();
  });

  it("polls a refresh while retaining the selected document and displays reading progress", async () => {
    configure(true, true, true);
    harness.store.form = { ...page };
    harness.store.hasUnsavedChanges = true;
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage,
        initialSetupState: {
          status: "working",
          homepage: "https://example.com/",
          domain: "example.com",
          conversationId: null,
          pages: [],
          progress: { fetched: 2, total: 4 },
        },
      }),
    );
    expect(harness.refreshWhileSetupWorks).toHaveBeenLastCalledWith(expect.objectContaining({ status: "working" }));
    expect(container.querySelector("[data-editor-readonly]")).not.toBeNull();
    expect(container.textContent).toContain("WikiSetup.status.readingBody");
    expect(harness.store.resetForm).not.toHaveBeenCalled();
  });

  it("shows an import failure alongside the preserved document without a refresh action", async () => {
    configure(true, true, true);
    harness.store.form = { ...page };
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: page,
        listPage,
        initialSetupState: {
          status: "failed",
          homepage: "https://example.com/",
          domain: "example.com",
          conversationId: null,
          pages: [page],
          refreshable: true,
        },
      }),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("WikiSetup.status.failedBody");
    expect(container.querySelector("[data-editor-readonly]")).not.toBeNull();
    expect(harness.refreshWhileSetupWorks).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" }));
    const actions = (harness.topBar as ReactElement<{ onRefreshFromWebsite?: () => void }>).props;
    expect(actions.onRefreshFromWebsite).toBeUndefined();
  });

  it("shows setup progress without a task link to managers who did not start it", async () => {
    configure(true, true, true);
    const { container } = await mount(
      createElement(WikiPageView, {
        initialPage: null,
        initialSetupState: {
          status: "working",
          homepage: "https://example.com/",
          domain: "example.com",
          conversationId: null,
          pages: [],
        },
        listPage,
      }),
    );
    const { container: topBar } = await mount(harness.topBar);

    expect(container.textContent).toContain("WikiSetup.status.workingTitle");
    expect(container.textContent).toContain("WikiSetup.status.workingBodyNoTaskWiki");
    expect(container.textContent).not.toContain("Wiki.emptyTitle");
    expect(container.textContent).not.toContain("WikiSetup.openTask");
    expect(container.textContent).not.toContain("Wiki.newPage");
    expect(container.querySelector('[data-testid="empty-page-agent-suggestions"]')).toBeNull();
    expect(topBar.querySelector('[aria-label="Wiki.newPage"]')).toBeNull();
    expect(harness.refreshWhileSetupWorks).toHaveBeenLastCalledWith(expect.objectContaining({ status: "working" }));
  });
});

describe("Wiki route lifetime", () => {
  it.each(["create", "delete"] as const)(
    "retains %s completion navigation while the replaceable inner view is absent",
    async (operation) => {
      configure(true, true, true);
      harness.realStore = true;
      harness.rootStore.navigationGuard = new NavigationGuardController();
      harness.rootStore.userStore = { can: () => true, canManage: () => true, user: { id: "user-1" } };
      const frame = (child: ReactNode) => createElement(WikiRouteScope, null, child);
      const { root } = await mount(
        frame(createElement(WikiPageView, { key: "before", initialPage: page, listPage: populatedList })),
      );
      const store = harness.store as unknown as RealWikiPageStore;
      const created = { ...page, id: "10000000-0000-4000-8000-000000000002", title: "Created during refresh" };
      let finish!: (value: unknown) => void;
      const pending = new Promise((resolve) => {
        finish = resolve;
      });
      const action = operation === "create" ? harness.createWikiPages : harness.deleteWikiPage;
      action.mockReturnValue(pending);
      if (operation === "create") {
        act(() => {
          store.startCreate();
          store.onChange("title", created.title);
        });
      }
      let completion!: Promise<unknown>;
      act(() => {
        completion = operation === "create" ? store.onSubmit() : store.delete();
      });
      expect(store.isLoading).toBe(true);
      act(() => root.render(frame(createElement("div", null, "Loading refreshed server data"))));
      await act(async () => {
        finish({ ok: true, data: operation === "create" ? [created] : page });
        await completion;
      });
      expect(harness.replace).toHaveBeenCalledExactlyOnceWith(
        operation === "create" ? `/wiki?page=${created.id}` : "/wiki",
      );
      expect(harness.refresh).toHaveBeenCalledOnce();
      expect(store.isLoading).toBe(true);
      expect(store.form.id).toBe(operation === "create" ? created.id : null);
      expect(store.awaitingSelection).toBe(true);
      act(() => store.startCreate("Must not replace the pending selection"));
      expect(store.creating).toBe(false);
      act(() =>
        root.render(frame(createElement(WikiPageView, { key: "stale", initialPage: page, listPage: populatedList }))),
      );
      expect(store.form.id).toBe(operation === "create" ? created.id : null);
      expect(store.awaitingSelection).toBe(true);
      act(() =>
        root.render(
          frame(
            createElement(WikiPageView, {
              key: "after",
              initialPage: operation === "create" ? created : null,
              requestedPageId: operation === "create" ? created.id : undefined,
              listPage: operation === "create" ? { ...listPage, items: [created], total: 1 } : listPage,
            }),
          ),
        ),
      );
      expect(harness.store).toBe(store);
      expect(store.form.id).toBe(operation === "create" ? created.id : null);
      expect(store.hasUnsavedChanges).toBe(false);
      expect(store.awaitingSelection).toBe(false);
      expect(store.isLoading).toBe(false);
    },
  );

  it.each(["reset", "save"] as const)(
    "retains dirty title and paragraphs through a replaced server subtree until %s",
    async (settle) => {
      configure(true, true, true);
      harness.realStore = true;
      const guard = new NavigationGuardController();
      harness.rootStore.navigationGuard = guard;
      harness.rootStore.userStore = { canManage: () => true, user: { id: "user-1" } };
      const frame = (child: ReactNode) => createElement(WikiRouteScope, null, child);
      const { root } = await mount(
        frame(createElement(WikiPageView, { key: "working", initialPage: page, listPage: populatedList })),
      );
      const store = harness.store as unknown as RealWikiPageStore;
      const markdown = "First unsaved paragraph.\n\nSecond unsaved paragraph.";
      const document = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "First unsaved paragraph." }] },
          { type: "paragraph", content: [{ type: "text", text: "Second unsaved paragraph." }] },
        ],
      };
      act(() => {
        store.onChange("title", "Unsaved title");
        store.onChange("markdown", markdown);
        store.editorDocument = document;
      });
      const fullReload = vi.fn();
      act(() => guard.requestRouteRefreshWhenSafe(fullReload));
      expect(guard.isRouteRefreshBlocked).toBe(true);
      act(() => root.render(frame(createElement("div", null, "Loading refreshed server data"))));
      expect(guard.isRouteRefreshBlocked).toBe(true);
      expect(fullReload).not.toHaveBeenCalled();
      const remote = {
        ...page,
        title: "Persisted remote title",
        markdown: "Persisted remote body",
        updatedAt: new Date("2026-10-03"),
      };
      act(() =>
        root.render(
          frame(
            createElement(WikiPageView, {
              key: "cancelled",
              initialPage: remote,
              listPage: populatedList,
              initialSetupState: {
                status: "failed",
                homepage: null,
                domain: null,
                conversationId: null,
                pages: [remote],
              },
            }),
          ),
        ),
      );
      expect(harness.store).toBe(store);
      expect(store.form.title).toBe("Unsaved title");
      expect(store.form.markdown).toBe(markdown);
      expect(store.editorDocument).toBe(document);
      expect(store.hasUnsavedChanges).toBe(true);
      const toolbar = renderToStaticMarkup(harness.topBar);
      expect(toolbar).toContain("Common.actions.save");
      expect(toolbar).not.toContain("Wiki.newPage");
      expect(fullReload).not.toHaveBeenCalled();
      if (settle === "reset") act(() => store.resetDocument());
      else {
        harness.updateWikiPage.mockResolvedValue({ ok: true, data: { ...remote, title: "Unsaved title", markdown } });
        await act(async () => store.onSubmit());
        expect(harness.updateWikiPage).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Unsaved title", markdown }),
        );
      }
      expect(store.hasUnsavedChanges).toBe(false);
      expect(fullReload).toHaveBeenCalledOnce();
    },
  );
});

describe("resolveWikiPageState", () => {
  const base = {
    isNavigating: false,
    missing: false,
    hasDocument: false,
    setupActive: false,
  };

  it("orders navigation, unavailability, document, setup and empty states", () => {
    expect(resolveWikiPageState({ ...base, isNavigating: true, missing: true })).toBe("loading");
    expect(resolveWikiPageState({ ...base, missing: true, setupActive: true })).toBe("error");
    expect(resolveWikiPageState({ ...base, hasDocument: true, setupActive: true })).toBe("content");
    expect(resolveWikiPageState({ ...base, setupActive: true })).toBe("setup");
    expect(resolveWikiPageState(base)).toBe("empty");
  });
});
