import type { ComponentProps, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { WikiGraph, WikiGraphNode } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageDto } from "@/features/wiki/wiki.schema";
import type { WikiGraphView as RealWikiGraphView } from "../wiki-graph-view";
import type { WikiPageActions as RealWikiPageActions } from "../wiki-page-actions";
import type { WikiPageList as RealWikiPageList } from "../wiki-page-list";
import type { WikiPageSheet as RealWikiPageSheet } from "../wiki-page-sheet";

import { act, createElement, isValidElement } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  rootStore: {} as Record<string, unknown>,
  push: vi.fn(),
  refresh: vi.fn(),
  topBar: null as unknown,
  wide: true,
  map: null as unknown,
  list: null as unknown,
  sheet: null as unknown,
  pin: vi.fn(),
  search: vi.fn(),
  liveSetupState: null as null | Record<string, unknown>,
  proposals: { bind: vi.fn(), setOpen: vi.fn(), dispose: vi.fn() },
  proposalsRefresh: null as null | (() => void),
  guarded: [] as unknown[],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
}));
vi.mock("../../actions", () => ({
  searchWikiPagesAction: harness.search,
  pinWikiGraphNodeAction: vi.fn(),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => harness.rootStore,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: harness.push, refresh: harness.refresh }),
}));
vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: (node: unknown) => {
    harness.topBar = node;
  },
}));
vi.mock("@/app/components/agent-chat/suggested-questions", () => ({
  AgentStarterActions: ({ fallback }: { fallback?: ReactNode }) => fallback ?? null,
}));
vi.mock("@/components/page-state/page-state", () => ({
  PageState: ({
    action,
    description,
    state,
    title,
  }: {
    action?: ReactNode;
    description?: ReactNode;
    state: string;
    title: ReactNode;
  }) => createElement("div", { "data-page-state": state }, createElement("h1", null, title), description, action),
}));
vi.mock("@/components/shared/alert", () => ({
  Alert: ({ description, variant }: { description?: ReactNode; variant?: string }) =>
    createElement("div", { "data-alert": variant ?? "default" }, description),
}));
vi.mock("@/components/modal/use-navigation-guard", () => ({
  useNavigationGuard: (store: unknown) => {
    harness.guarded.push(store);
  },
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (run: () => unknown) => Promise.resolve().then(run),
  reportApplicationError: vi.fn(),
}));
vi.mock("@/core/errors/workspace-changed-notice", () => ({
  notifyIfWorkspaceChanged: () => false,
}));
vi.mock("@/components/wiki/wiki-homepage-setup", () => ({
  useLiveWikiSetupState: (state: Record<string, unknown>) => harness.liveSetupState ?? state,
  useWikiSetupFailureBody: () => "WikiSetup.status.failedBody",
  EMPTY_WIKI_HOMEPAGE_SETUP_STATE: { status: "idle", homepage: null, domain: null, pages: [] },
}));
vi.mock("@/components/wiki/wiki-setup-progress", () => ({
  WikiSetupProgress: () => createElement("div", { "data-setup-progress": "" }),
}));
vi.mock("@/hooks/use-media-query", () => ({
  useIsWiderThan: () => harness.wide,
}));
vi.mock("../use-wiki-graph-positions", () => ({
  useWikiGraphPositions: (graph: WikiGraph | null) => ({
    nodes: graph?.nodes ?? [],
    move: vi.fn(),
    restore: vi.fn(),
    pin: harness.pin,
  }),
}));
vi.mock("../wiki-graph-view", () => ({
  WikiGraphView: (props: unknown) => {
    harness.map = props;
    return createElement("div", { "data-map": "" });
  },
}));
vi.mock("../wiki-page-list", () => ({
  WikiPageList: (props: unknown) => {
    harness.list = props;
    return createElement("div", { "data-list": "" });
  },
}));
vi.mock("../wiki-page-sheet", () => ({
  WikiPageSheet: (props: { open: boolean; state: string }) => {
    harness.sheet = props;
    return createElement("div", { "data-sheet": props.open ? props.state : "closed" });
  },
}));
vi.mock("../wiki-page-skeleton", () => ({ WikiPageSkeleton: () => null }));
vi.mock("../wiki-proposals", () => ({
  WikiProposals: () => createElement("div", { "data-proposals": "" }),
}));
vi.mock("../wiki-proposals-entry", () => ({
  WikiProposalsEntry: () => createElement("button", { "data-proposals-entry": "" }),
}));
vi.mock("../wiki-proposals.store", () => ({
  WikiProposalsStore: function WikiProposalsStore(_rootStore: unknown, refresh: () => void) {
    harness.proposalsRefresh = refresh;
    return harness.proposals;
  },
}));

import { WikiPageView } from "../wiki-page-view";

type ViewProps = ComponentProps<typeof WikiPageView>;
type MapProps = ComponentProps<typeof RealWikiGraphView>;
type ListProps = ComponentProps<typeof RealWikiPageList>;
type SheetProps = ComponentProps<typeof RealWikiPageSheet>;
type ActionsProps = ComponentProps<typeof RealWikiPageActions>;

const GUIDE = "10000000-0000-4000-8000-000000000001";
const REFUNDS = "10000000-0000-4000-8000-000000000002";
const PRICING = "10000000-0000-4000-8000-000000000003";
const updatedAt = new Date("2026-11-16T10:00:00.000Z");

const node = (overrides: Partial<WikiGraphNode> & { id: string; title: string }): WikiGraphNode => ({
  kind: "knowledge",
  whenToUse: null,
  updatedAt,
  inbound: 0,
  outbound: 0,
  missing: 0,
  records: 0,
  x: 0.5,
  y: 0.5,
  pinned: false,
  ...overrides,
});
const graph: WikiGraph = {
  nodes: [
    node({ id: GUIDE, title: "Operating Guide", kind: "guide" }),
    node({ id: REFUNDS, title: "Refunds", kind: "procedure", x: 0.3, y: 0.3 }),
    node({ id: PRICING, title: "Pricing", x: 0.7, y: 0.6, pinned: true }),
  ],
  links: [{ source: REFUNDS, target: GUIDE }],
  recordTypes: [],
  truncated: false,
  syncing: false,
};
const emptyGraph: WikiGraph = { ...graph, nodes: [], links: [] };
const refunds: WikiPageDto = {
  id: REFUNDS,
  title: "Refunds",
  markdown: "1. Refund the customer.",
  kind: "procedure",
  whenToUse: "When a customer asks for a refund.",
  createdAt: updatedAt,
  updatedAt,
};

const state = observable({
  creating: false,
  hasUnsavedChanges: false,
  isLoading: false,
  unavailable: false,
  awaitingSelection: false,
  savedState: 0,
  formId: null as string | null,
});
const spies = {
  initializeServerPage: vi.fn(),
  receiveServerPage: vi.fn(),
  startCreate: vi.fn(),
  load: vi.fn(),
  reload: vi.fn(),
};
const permissions = { create: true, update: true, delete: true };
const store = {
  get creating() {
    return state.creating;
  },
  get hasUnsavedChanges() {
    return state.hasUnsavedChanges;
  },
  get isLoading() {
    return state.isLoading;
  },
  get unavailable() {
    return state.unavailable;
  },
  get awaitingSelection() {
    return state.awaitingSelection;
  },
  get savedState() {
    return state.savedState;
  },
  form: {
    get id() {
      return state.formId;
    },
  },
  allows: (action: Action) =>
    action === Action.create ? permissions.create : action === Action.update ? permissions.update : permissions.delete,
  ...spies,
};

const roots: Root[] = [];
const containers: HTMLElement[] = [];
let tryNavigate: ReturnType<typeof vi.fn>;

function unmountAll() {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
}

async function mount(props: Partial<ViewProps> = {}) {
  unmountAll();
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(WikiPageView, { graph, initialPage: null, ...props }));
    await Promise.resolve();
  });
  return { container };
}

const during = (run: () => void) =>
  act(async () => {
    run();
    await Promise.resolve();
  });

const holds = (change: Partial<typeof state>) => during(() => runInAction(() => Object.assign(state, change)));

const map = () => harness.map as MapProps;
const list = () => harness.list as ListProps;
const sheet = () => harness.sheet as SheetProps;
function topBar(): ActionsProps {
  if (!isValidElement<ActionsProps>(harness.topBar)) throw new Error("The Knowledge Base published no top bar.");
  return harness.topBar.props;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  runInAction(() => {
    state.creating = false;
    state.hasUnsavedChanges = false;
    state.isLoading = false;
    state.unavailable = false;
    state.awaitingSelection = false;
    state.savedState = 0;
    state.formId = null;
  });
  Object.assign(permissions, { create: true, update: true, delete: true });
  harness.wide = true;
  harness.map = null;
  harness.list = null;
  harness.sheet = null;
  harness.topBar = null;
  harness.liveSetupState = null;
  harness.guarded.length = 0;
  harness.pin.mockResolvedValue(undefined);
  harness.search.mockResolvedValue({ ok: true, data: { items: [] } });
  tryNavigate = vi.fn((navigate: () => void) => {
    navigate();
    return true;
  });
  harness.rootStore = {
    wikiPageStore: store,
    appMode: "app",
    navigationGuard: { tryNavigate },
    userStore: {
      can: (resource: Resource, action: Action) => resource === Resource.wiki && store.allows(action),
    },
  };
});

afterEach(unmountAll);

describe("Knowledge Base view", () => {
  describe("what is behind the page sheet", () => {
    it("shows the pages as a map on a wide screen, with no page list and no open sheet", async () => {
      const { container } = await mount();

      expect(container.querySelector("[data-map]")).not.toBeNull();
      expect(container.querySelector("[data-list]")).toBeNull();
      expect(container.querySelector("[data-sheet]")?.getAttribute("data-sheet")).toBe("closed");
      expect(map()).toMatchObject({ graph, canPin: true, query: "", selectedId: null });
      expect(map().positions.nodes).toEqual(graph.nodes);
      expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("Wiki.graph.label");
    });

    it("shows the pages as a list on a narrow screen and offers no pinning there", async () => {
      harness.wide = false;
      const { container } = await mount({ initialPage: refunds, requestedPageId: REFUNDS });
      await holds({ formId: REFUNDS });

      expect(container.querySelector("[data-map]")).toBeNull();
      expect(container.querySelector("[data-list]")).not.toBeNull();
      expect(list().nodes).toEqual(graph.nodes);
      expect(list().truncated).toBe(false);
      expect([...list().visible]).toEqual([GUIDE, REFUNDS, PRICING]);
      expect(sheet().canPin).toBe(false);
    });

    it("says that the pages could not be read and retries on request", async () => {
      const { container } = await mount({ graph: null });

      expect(container.querySelector('[data-page-state="error"]')?.textContent).toContain("Wiki.unavailableTitle");
      expect(container.textContent).toContain("Wiki.graph.loadFailed");
      expect(container.querySelector("[data-map]")).toBeNull();
      act(() => container.querySelector<HTMLButtonElement>('[data-page-state="error"] button')?.click());
      expect(harness.refresh).toHaveBeenCalledOnce();
    });

    it("invites an editor to write the first page and gives the top bar no search", async () => {
      const { container } = await mount({ graph: emptyGraph });

      expect(container.querySelector('[data-page-state="empty"]')?.textContent).toContain("Wiki.emptyTitle");
      expect(container.textContent).toContain("Wiki.emptyBody");
      expect(topBar().search).toBeNull();
      act(() => container.querySelector<HTMLButtonElement>('[data-page-state="empty"] button')?.click());
      expect(spies.startCreate).toHaveBeenCalledOnce();
    });

    it("tells a reader of an empty Knowledge Base that there is nothing yet, without a create button", async () => {
      Object.assign(permissions, { create: false, update: false, delete: false });
      const { container } = await mount({ graph: emptyGraph });

      expect(container.textContent).toContain("Wiki.emptyBodyReadOnly");
      expect(container.querySelector('[data-page-state="empty"] button')).toBeNull();
      expect(container.querySelector("[data-proposals]")).toBeNull();
    });

    it("shows the website import while it writes the first pages", async () => {
      harness.liveSetupState = { status: "working", homepage: null, domain: "example.com", pages: [] };
      const { container } = await mount({ graph: emptyGraph });

      expect(container.textContent).toContain("WikiSetup.status.workingTitle");
      expect(container.textContent).toContain("WikiSetup.status.workingBodyWiki:example.com");
      expect(container.querySelector("[data-setup-progress]")).not.toBeNull();
    });

    it("keeps the map and adds a banner while an import adds pages to existing ones", async () => {
      harness.liveSetupState = { status: "working", homepage: null, domain: null, pages: [] };
      const { container } = await mount();

      expect(container.querySelector("[data-map]")).not.toBeNull();
      expect(container.querySelector("[data-wiki-import-banner]")?.textContent).toBe(
        "WikiSetup.status.backgroundBanner",
      );
    });

    it("reports a failed import above the pages", async () => {
      harness.liveSetupState = { status: "failed", homepage: null, domain: null, pages: [] };
      const { container } = await mount();

      expect(container.querySelector('[data-alert="warning"]')?.textContent).toBe("WikiSetup.status.failedBody");
    });
  });

  describe("the page sheet", () => {
    it("opens the page the address names once the store holds it", async () => {
      const { container } = await mount({ initialPage: refunds, requestedPageId: REFUNDS });
      expect(spies.initializeServerPage).toHaveBeenCalledWith(refunds, REFUNDS);
      expect(spies.receiveServerPage).toHaveBeenCalledWith(refunds, REFUNDS);
      expect(container.querySelector("[data-sheet]")?.getAttribute("data-sheet")).toBe("loading");

      await holds({ formId: REFUNDS });

      expect(container.querySelector("[data-sheet]")?.getAttribute("data-sheet")).toBe("page");
      expect(map().selectedId).toBe(REFUNDS);
      expect(sheet()).toMatchObject({ open: true, state: "page", pinned: false, canPin: true, otherGuide: true });
    });

    it("says that a page is gone instead of opening another one", async () => {
      const { container } = await mount({ requestedPageId: REFUNDS, unavailable: true });

      expect(container.querySelector("[data-sheet]")?.getAttribute("data-sheet")).toBe("error");
    });

    it("opens for a new page without changing the address", async () => {
      const { container } = await mount();
      act(() => topBar().onCreate());
      expect(spies.startCreate).toHaveBeenCalledOnce();
      await holds({ creating: true });

      expect(container.querySelector("[data-sheet]")?.getAttribute("data-sheet")).toBe("page");
      expect(sheet().pinned).toBeNull();
      expect(harness.push).not.toHaveBeenCalled();
    });

    it("tells the sheet whether the open page is pinned and whether it is the only guide", async () => {
      await mount({ requestedPageId: PRICING });
      await holds({ formId: PRICING });
      expect(sheet()).toMatchObject({ pinned: true, otherGuide: true });

      await mount({ requestedPageId: GUIDE });
      await holds({ formId: GUIDE });
      expect(sheet()).toMatchObject({ pinned: false, otherGuide: false });
    });

    it("pins the open page where it lies and releases a pinned one", async () => {
      await mount({ requestedPageId: REFUNDS });
      await holds({ formId: REFUNDS });
      await during(() => sheet().onTogglePin());
      expect(harness.pin).toHaveBeenLastCalledWith(
        REFUNDS,
        { x: 0.3, y: 0.3, pinned: false },
        { x: 0.3, y: 0.3, pinned: false },
      );

      await mount({ requestedPageId: PRICING });
      await holds({ formId: PRICING });
      await during(() => sheet().onTogglePin());
      expect(harness.pin).toHaveBeenLastCalledWith(PRICING, null, { x: 0.7, y: 0.6, pinned: true });
    });

    it("offers no pinning in the public demo or to a reader", async () => {
      harness.rootStore.appMode = "demo";
      await mount();
      expect(map().canPin).toBe(false);

      harness.rootStore.appMode = "app";
      permissions.update = false;
      await mount();
      expect(map().canPin).toBe(false);
    });
  });

  describe("moving between pages", () => {
    it("opens a clicked page by address and shows its sheet while the page is fetched", async () => {
      let arrive: () => void = () => {};
      harness.push.mockReturnValue(new Promise<void>((resolve) => (arrive = resolve)));
      const { container } = await mount();

      await during(() => map().onSelect(REFUNDS));

      expect(spies.load).toHaveBeenCalledWith(null);
      expect(harness.push).toHaveBeenCalledExactlyOnceWith(`/wiki?page=${REFUNDS}`);
      expect(container.querySelector("[data-sheet]")?.getAttribute("data-sheet")).toBe("loading");
      expect(map().selectedId).toBe(REFUNDS);

      await during(() => arrive());
      expect(container.querySelector("[data-sheet]")?.getAttribute("data-sheet")).toBe("closed");
    });

    it("does nothing when the open page is clicked again", async () => {
      await mount({ initialPage: refunds, requestedPageId: REFUNDS });
      await holds({ formId: REFUNDS });

      await during(() => sheet().onSelect(REFUNDS));

      expect(harness.push).not.toHaveBeenCalled();
      expect(tryNavigate).not.toHaveBeenCalled();
    });

    it("closes the sheet by returning to the map address", async () => {
      await mount({ initialPage: refunds, requestedPageId: REFUNDS });
      await holds({ formId: REFUNDS });

      await during(() => sheet().onClose());

      expect(spies.load).toHaveBeenCalledWith(refunds);
      expect(harness.push).toHaveBeenCalledExactlyOnceWith("/wiki");
    });

    it("drops a new page on close without touching the address", async () => {
      await mount();
      await holds({ creating: true });

      await during(() => sheet().onClose());

      expect(spies.load).toHaveBeenCalledWith(null);
      expect(harness.push).not.toHaveBeenCalled();
    });

    it("keeps the page open when unsaved changes hold the navigation back", async () => {
      tryNavigate.mockImplementation(() => false);
      await mount({ initialPage: refunds, requestedPageId: REFUNDS });
      await holds({ formId: REFUNDS });

      await during(() => {
        map().onSelect(PRICING);
        sheet().onClose();
        topBar().onCreate();
      });

      expect(tryNavigate).toHaveBeenCalledTimes(3);
      expect(harness.push).not.toHaveBeenCalled();
      expect(spies.load).not.toHaveBeenCalled();
      expect(spies.startCreate).not.toHaveBeenCalled();
    });

    it("reloads a page that changed elsewhere", async () => {
      await mount({ initialPage: refunds, requestedPageId: REFUNDS });
      await during(() => sheet().onReload());

      expect(spies.reload).toHaveBeenCalledOnce();
    });

    it("takes the server's page again after a save, a discard or a finished load", async () => {
      await mount({ initialPage: refunds, requestedPageId: REFUNDS });
      spies.receiveServerPage.mockClear();

      await holds({ hasUnsavedChanges: true });
      await holds({ hasUnsavedChanges: false });
      expect(spies.receiveServerPage).toHaveBeenCalledExactlyOnceWith(refunds, REFUNDS);

      spies.receiveServerPage.mockClear();
      await holds({ isLoading: true, savedState: 1 });
      await holds({ isLoading: false });
      expect(spies.receiveServerPage).not.toHaveBeenCalled();
    });
  });

  describe("the top bar", () => {
    it("holds the page search, the proposal review and the new page button", async () => {
      await mount();

      expect(topBar().search).not.toBeNull();
      expect(isValidElement(topBar().proposals)).toBe(true);
      expect(topBar().store).toBe(store);
      expect(harness.guarded).toContain(store);
    });

    it("narrows the map as the search is typed and opens the first match on Enter", async () => {
      await mount();
      act(() => topBar().search?.setQuery("pric"));

      expect(map().query).toBe("pric");
      await during(() => topBar().onOpenFirst());
      expect(harness.push).toHaveBeenCalledExactlyOnceWith(`/wiki?page=${PRICING}`);
    });

    it("opens a page the search found that the map does not show", async () => {
      const offMap = "10000000-0000-4000-8000-0000000000ff";
      const answer = (query: string, found: string[], foundQuery = query) =>
        act(() => {
          const search = topBar().search;
          search?.setQuery(query);
          if (search) {
            runInAction(() => {
              search.found = new Set(found);
              search.foundQuery = foundQuery;
            });
          }
        });

      await mount();
      answer("page beyond the map", [offMap]);
      await during(() => topBar().onOpenFirst());
      expect(harness.push).toHaveBeenCalledExactlyOnceWith(`/wiki?page=${offMap}`);

      harness.push.mockClear();
      await mount({ graph: { ...graph, truncated: true } });
      answer("pric", [offMap, PRICING]);
      await during(() => topBar().onOpenFirst());
      expect(harness.push).toHaveBeenCalledExactlyOnceWith(`/wiki?page=${offMap}`);

      harness.push.mockClear();
      await mount({ graph: { ...graph, truncated: true } });
      answer("pric", [offMap, PRICING], "an earlier search");
      await during(() => topBar().onOpenFirst());
      expect(harness.push).toHaveBeenCalledExactlyOnceWith(`/wiki?page=${PRICING}`);
    });

    it("opens nothing on Enter when no page matches", async () => {
      await mount();
      act(() => topBar().search?.setQuery("nothing like this"));
      await during(() => topBar().onOpenFirst());

      expect(harness.push).not.toHaveBeenCalled();
    });

    it("binds the proposal review for an editor and opens it when the address asks", async () => {
      const { container } = await mount({ openProposals: true });

      expect(harness.proposals.bind).toHaveBeenCalledOnce();
      expect(harness.proposals.setOpen).toHaveBeenCalledExactlyOnceWith(true);
      expect(container.querySelector("[data-proposals]")).not.toBeNull();
      harness.proposalsRefresh?.();
      expect(harness.refresh).toHaveBeenCalledOnce();
    });

    it("leaves the proposal review out for a reader", async () => {
      permissions.update = false;
      const { container } = await mount({ openProposals: true });

      expect(harness.proposals.bind).not.toHaveBeenCalled();
      expect(topBar().proposals).toBeUndefined();
      expect(container.querySelector("[data-proposals]")).toBeNull();
    });
  });
});
