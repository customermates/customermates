import type { DataViewEmptyState } from "@/components/data-view/data-view-empty-state";
import type { PageStateProps } from "@/components/page-state/page-state";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { ReactElement, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingProvider, MessagingThreadState, MessagingThreadType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  activeFiltersProps: vi.fn(),
  emptyStateProps: vi.fn(),
  ensureLoaded: vi.fn(),
  getRootStore: vi.fn(),
  loadOlderMessages: vi.fn(),
  pageStateProps: vi.fn(),
  replace: vi.fn(),
  search: "",
  setQueryOptions: vi.fn(),
  setTopBarActions: vi.fn(),
  threadRowProps: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(harness.search),
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href, ...props }: { children?: ReactNode; href: string }) =>
    createElement("a", { ...props, href }, children),
  usePathname: () => "/inbox",
  useRouter: () => ({ replace: harness.replace }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: harness.setTopBarActions,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: harness.getRootStore,
}));

vi.mock("@/components/data-view/use-data-view-sync", () => ({ useDataViewSync: vi.fn() }));

vi.mock("@/components/data-view/data-view-toolbar", () => ({
  DataViewToolbar: () => createElement("div", { "data-data-view-toolbar": true }),
}));

vi.mock("@/components/data-view/header/active-filters-bar", () => ({
  DataViewActiveFiltersBar: (props: Record<string, unknown>) => {
    harness.activeFiltersProps(props);
    return createElement("div", { "data-active-filters": true });
  },
}));

vi.mock("@/components/data-view/header/pagination", () => ({
  DataViewPagination: () => createElement("div", { "data-pagination": true }),
}));

vi.mock("@/components/data-view/data-view-empty-state", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<{ DataViewEmptyState: typeof DataViewEmptyState }>();

  return {
    ...actual,
    DataViewEmptyState: (props: Parameters<typeof actual.DataViewEmptyState>[0]) => {
      harness.emptyStateProps(props);
      return React.createElement(actual.DataViewEmptyState, props);
    },
  };
});

vi.mock("@/components/page-state/page-state", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<{ PageState: (props: PageStateProps) => ReactElement }>();

  return {
    ...actual,
    PageState: (props: Parameters<typeof actual.PageState>[0]) => {
      harness.pageStateProps(props);
      return React.createElement(actual.PageState, props);
    },
  };
});

vi.mock("../thread-row", () => ({
  ThreadRow: (props: { onClick: () => void; thread: MessagingThread }) => {
    harness.threadRowProps(props);
    return createElement("div", { "data-thread-row": props.thread.id });
  },
}));

vi.mock("../thread-auto-mark-read", () => ({
  ThreadAutoMarkRead: () => createElement("div", { "data-thread-auto-read": true }),
}));

vi.mock("../thread-topbar", () => ({
  ThreadTopBar: () => createElement("div", { "data-thread-topbar": true }),
}));

vi.mock("@/components/scroll/messages-scroll-container", () => ({
  MessagesScrollContainer: ({ children, scrollKey }: { children?: ReactNode; scrollKey: string }) =>
    createElement("div", { "data-message-scroll": scrollKey }, children),
}));

vi.mock("../thread-reply-composer", () => ({
  ThreadReplyComposer: () => createElement("div", { "data-thread-reply": true }),
}));

vi.mock("../message-item", () => ({
  MessageItem: () => createElement("div", { "data-message-item": true }),
}));

vi.mock("../message-date-separator", () => ({
  isSameDay: () => true,
  MessageDateSeparator: () => createElement("div", { "data-date-separator": true }),
}));

import { InboxList } from "../inbox-list";
import { ThreadPanel } from "../thread-panel";

type ListStatus = "uninitialized" | "ready" | "refresh-error";

const thread: MessagingThread = {
  id: "4aaaf6c2-6a8b-4d25-b551-acf34e399a46",
  connectedAccountId: "5ea98f35-59ce-4209-bba6-5c223c6c563f",
  unipileThreadId: "provider-thread",
  provider: MessagingProvider.google,
  type: MessagingThreadType.single,
  name: "Customer",
  subject: "Hello",
  preview: "Preview",
  previewKind: null,
  lastMessageAt: new Date("2025-01-02T00:00:00.000Z"),
  participants: [],
  state: MessagingThreadState.open,
  sharedToCrm: false,
  accountShared: false,
  isOwner: true,
  lastMessageFromSelf: false,
  lastMessageSenderName: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-02T00:00:00.000Z"),
};

function request(status: ListStatus) {
  return status === "refresh-error" ? { status, error: new Error("failed") } : { status };
}

function renderInboxList(
  status: ListStatus,
  options: {
    canConnect?: boolean;
    filters?: unknown[];
    locked?: boolean;
    searchTerm?: string;
    selectedThreadId?: string | null;
    withItem?: boolean;
  } = {},
) {
  const items = options.withItem ? [thread] : [];
  const messagingThreadsStore = {
    dataRequest: request(status),
    filters: options.filters ?? [],
    isReady: true,
    isRefreshing: false,
    isRefreshingInbox: false,
    items,
    pagination: { page: 1, pageSize: 25, total: items.length, totalPages: items.length ? 1 : 0 },
    refreshInbox: vi.fn(),
    searchTerm: options.searchTerm,
    setQueryOptions: harness.setQueryOptions,
  };
  harness.getRootStore.mockReturnValue({
    connectedAccountsStore: { ensureLoaded: harness.ensureLoaded, needsActionCount: 0 },
    messagingThreadsStore,
  });

  return renderToStaticMarkup(
    createElement(InboxList, {
      canConnect: options.canConnect ?? true,
      locked: options.locked,
      selectedThreadId: options.selectedThreadId ?? null,
      threads: {
        items,
        pagination: messagingThreadsStore.pagination,
        filters: options.filters ?? [],
        searchTerm: options.searchTerm,
      } as never,
    }),
  );
}

function renderThreadPanel(status: "locked" | "loading" | "empty" | "content") {
  const store = {
    accountOwners: {},
    hydrate: vi.fn(),
    loadOlderMessages: harness.loadOlderMessages,
    loadingOlder: false,
    messages: [],
    thread: status === "content" || status === "empty" ? thread : null,
  };
  harness.getRootStore.mockReturnValue({ messagingThreadDetailStore: store });
  const threadDetail = status === "empty" ? null : { accountOwners: {}, folderContext: null, messages: [], thread };

  return renderToStaticMarkup(
    createElement(ThreadPanel, {
      locked: status === "locked",
      threadDetail,
    }),
  );
}

function latestTopBar() {
  return harness.setTopBarActions.mock.lastCall?.[0] as ReactElement | null;
}

describe("Inbox page-state owners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.search = "";
  });

  it("renders locked, loading, error, filtered-empty, true-empty, and content list branches", () => {
    const locked = renderInboxList("ready", { locked: true });
    expect(locked).toContain('data-page-skeleton-empty="true"');
    expect(locked).toContain('data-skeleton-view="list"');
    expect(latestTopBar()).toBeNull();

    const loading = renderInboxList("uninitialized");
    expect(loading).toContain('data-page-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain("data-skeleton-motion");

    const error = renderInboxList("refresh-error");
    expect(error).toContain('data-page-state="error"');
    expect(error).toContain('role="alert"');

    const filtered = renderInboxList("ready", { searchTerm: "missing" });
    expect(filtered).toContain("Common.emptyState.filteredTitle");
    expect(filtered).not.toContain('data-page-state="empty"');

    const empty = renderInboxList("ready");
    expect(empty).toContain('data-page-state="empty"');
    expect(empty).toContain('data-page-skeleton-empty="true"');
    expect(empty).toContain('data-variant="secondary"');

    const content = renderInboxList("ready", { withItem: true });
    expect(content).toContain(`data-thread-row="${thread.id}"`);
    expect(content).toContain('data-pagination="true"');
    expect(content).toContain("animate-page-result-in");
  });

  it("wires retry, clear, selection, and retained-content refresh failure", () => {
    renderInboxList("refresh-error");
    const errorProps = harness.pageStateProps.mock.calls.find(([props]) => props.state === "error")?.[0];
    const retry = errorProps?.action as ReactElement<{ onClick: () => void }>;
    retry.props.onClick();
    expect(harness.setQueryOptions).toHaveBeenCalledWith({ forceRefresh: true });

    renderInboxList("ready", { searchTerm: "missing" });
    const filteredProps = harness.emptyStateProps.mock.lastCall?.[0] as {
      secondaryAction: { onClick: () => void };
    };
    filteredProps.secondaryAction.onClick();
    expect(harness.setQueryOptions).toHaveBeenCalledWith({ filters: [], searchTerm: "" });

    harness.search = "foo=bar";
    renderInboxList("ready", { withItem: true });
    const rowProps = harness.threadRowProps.mock.lastCall?.[0] as { onClick: () => void };
    rowProps.onClick();
    expect(harness.replace).toHaveBeenCalledWith(`/inbox?foo=bar&threadId=${thread.id}`, { scroll: false });

    const retained = renderInboxList("refresh-error", { withItem: true });
    expect(retained).toContain(`data-thread-row="${thread.id}"`);
    expect(retained).toContain('data-pagination="true"');
    expect(retained).not.toContain('data-page-state="error"');
  });

  it("keeps the connect action primary in the topbar and secondary in true empty", () => {
    const empty = renderInboxList("ready");
    const topBar = renderToStaticMarkup(latestTopBar() as ReactElement);
    expect(topBar).toContain('data-variant="default"');
    expect(empty).toContain('data-variant="secondary"');

    const readOnly = renderInboxList("ready", { canConnect: false });
    expect(readOnly).not.toContain("<button");
    expect(renderToStaticMarkup(latestTopBar() as ReactElement)).not.toContain("ConnectedAccountsCard.title");
  });

  it("renders locked, loading, empty, and content transcript branches", () => {
    const locked = renderThreadPanel("locked");
    expect(locked).toContain('data-page-skeleton-empty="true"');
    expect(locked).toContain('data-skeleton-view="transcript"');

    const loading = renderThreadPanel("loading");
    expect(loading).toContain('data-page-state="loading"');
    expect(loading).toContain('role="status"');

    const empty = renderThreadPanel("empty");
    expect(empty).toContain('data-page-state="empty"');
    expect(empty).toContain("Inbox.selectThread");

    const content = renderThreadPanel("content");
    expect(content).toContain('data-thread-topbar="true"');
    expect(content).toContain('data-thread-auto-read="true"');
    expect(content).toContain(`data-message-scroll="thread:${thread.id}"`);
    expect(content).toContain('data-thread-reply="true"');
    expect(content).toContain("animate-page-result-in");
  });
});
