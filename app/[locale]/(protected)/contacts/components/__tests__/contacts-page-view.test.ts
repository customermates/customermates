import type { ReactElement } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { ContactDto } from "@/features/contacts/contact.schema";
import type { PageStateProps } from "@/components/page-state/page-state";
import { ViewMode } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({
  getRootStore: vi.fn(),
  openEntity: vi.fn(),
  pageStateProps: vi.fn(),
  setTopBarActions: vi.fn(),
  setQueryOptions: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: harness.setTopBarActions,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: harness.getRootStore,
}));

vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useEntityHref: () => (_entityType: EntityType, id: string) => `/entity/${id}`,
  useOpenEntity: () => harness.openEntity,
}));

vi.mock("@/components/data-view/header/display-options", () => ({
  DataViewDisplayOptions: () => null,
}));

vi.mock("@/components/data-view/header/filter-popover", () => ({
  FilterPopover: () => null,
}));

vi.mock("@/components/data-view/header/search", () => ({
  DataViewSearch: () => null,
}));

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

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: () => "Contacts",
    singular: () => "Contact",
  }),
}));

vi.mock("@/components/data-view/use-data-view-sync", () => ({
  useDataViewSync: vi.fn(),
}));

vi.mock("../use-contact-columns", () => ({
  useContactColumns: () => [],
}));

vi.mock("@/components/data-view/data-view-layout", () => ({
  DataViewLayout: ({ children, showPagination }: { children: ReactElement; showPagination: boolean }) =>
    createElement(
      "div",
      {
        "data-data-view-layout": true,
        "data-show-pagination": showPagination,
      },
      children,
    ),
}));

vi.mock("@/components/data-view/data-view-content", () => ({
  DataViewContent: ({ view }: { view: string }) =>
    createElement("div", {
      "data-data-view-content": true,
      "data-view": view,
    }),
}));

import { ContactsPageView } from "../contacts-page-view";

type StoreState = {
  canManage?: boolean;
  filters?: unknown[];
  groupingColumnId?: string | null;
  isReady?: boolean;
  isRefreshing?: boolean;
  itemCount?: number;
  requestError?: unknown;
  searchTerm?: string;
  total?: number;
  viewMode?: ViewMode;
};

const initialContacts = {
  items: [],
  pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
} as unknown as GetResult<ContactDto>;

function renderState(state: StoreState = {}) {
  const contactsStore = {
    canManage: state.canManage ?? true,
    dataRequest:
      state.isReady === false
        ? { status: "uninitialized" }
        : state.isRefreshing
          ? { status: "refreshing" }
          : state.requestError
            ? { status: "refresh-error", error: state.requestError }
            : { status: "ready" },
    entityType: EntityType.contact,
    filters: state.filters ?? [],
    groupingColumnId: state.groupingColumnId ?? null,
    isReady: state.isReady ?? true,
    isDisabled: !(state.canManage ?? true),
    isRefreshing: state.isRefreshing ?? false,
    items: Array.from({ length: state.itemCount ?? 0 }, (_, index) => ({ id: String(index) })),
    pagination: {
      page: 1,
      pageSize: 25,
      total: state.total ?? state.itemCount ?? 0,
      totalPages: 1,
    },
    searchTerm: state.searchTerm,
    setQueryOptions: harness.setQueryOptions,
    viewMode: state.viewMode ?? ViewMode.table,
  };
  harness.getRootStore.mockReturnValue({
    contactsStore,
    dealsStore: {},
    organizationsStore: {},
  });

  return renderToStaticMarkup(createElement(ContactsPageView, { contacts: initialContacts }));
}

describe("ContactsPageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [ViewMode.table, null, "table"],
    [ViewMode.card, null, "cards"],
    [ViewMode.card, "pipeline", "board"],
  ] as const)("renders one accessible animated %s loading branch", (viewMode, groupingColumnId, view) => {
    const html = renderState({ groupingColumnId, isReady: false, viewMode });

    expect(html).toContain('data-page-state="loading"');
    expect(html).toContain('data-contacts-page-skeleton="true"');
    expect(html).toContain(`data-skeleton-view="${view}"`);
    expect(html).toContain("data-skeleton-motion");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-show-pagination="false"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("data-data-view-content");
  });

  it("renders one explicit error branch with a working retry after an empty refresh fails", () => {
    const html = renderState({
      requestError: new Error("failed"),
    });

    expect(html).toContain('data-page-state="error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("ErrorCard.retry");
    expect(html).not.toContain("data-data-view-content");

    const errorProps = harness.pageStateProps.mock.calls.find(([props]) => props.state === "error")?.[0];
    const retry = errorProps?.action as ReactElement<{ onClick: () => void }>;
    retry.props.onClick();
    expect(harness.setQueryOptions).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it("keeps filtered empty distinct from true empty", () => {
    const filtered = renderState({
      filters: [{ field: "name" }],
      itemCount: 0,
      total: 0,
    });
    const empty = renderState({ itemCount: 0, total: 0 });

    expect(filtered).toContain("Common.emptyState.filteredTitle");
    expect(filtered).toContain("Common.emptyState.clearFilters");
    expect(filtered).not.toContain('data-page-state="empty"');
    expect(filtered).toContain('data-show-pagination="false"');
    expect(empty).toContain('data-page-state="empty"');
    expect(empty).toContain('data-page-skeleton-empty="true"');
    expect(empty).toContain('data-variant="secondary"');
    expect(empty).toContain('data-show-pagination="false"');
  });

  it.each([
    [ViewMode.table, null, "table"],
    [ViewMode.card, null, "cards"],
    [ViewMode.card, "pipeline", "board"],
  ] as const)("uses one static inert %s background for true empty", (viewMode, groupingColumnId, view) => {
    const html = renderState({ groupingColumnId, itemCount: 0, total: 0, viewMode });

    expect(html).toContain(`data-skeleton-view="${view}"`);
    expect(html).toContain('data-page-state-background="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain('data-page-skeleton-empty="true"');
    expect(html).not.toContain("data-skeleton-motion");
  });

  it("omits the true-empty CTA when Contacts are read-only", () => {
    const html = renderState({
      canManage: false,
      itemCount: 0,
      total: 0,
    });

    expect(html).toContain('data-page-state="empty"');
    expect(html).not.toContain("<button");
  });

  it.each([
    [ViewMode.table, null, "table"],
    [ViewMode.card, null, "cards"],
    [ViewMode.card, "pipeline", "board"],
  ] as const)(
    "renders loaded %s content through the presentational content owner",
    (viewMode, groupingColumnId, view) => {
      const html = renderState({
        groupingColumnId,
        itemCount: 1,
        total: 1,
        viewMode,
      });

      expect(html).toContain('data-data-view-content="true"');
      expect(html).toContain(`data-view="${view}"`);
      expect(html).toContain(`data-show-pagination="${view !== "board"}"`);
      expect(html).not.toContain("data-page-state");
    },
  );

  it("keeps the Contacts topbar action primary while the body action remains secondary", () => {
    const html = renderState({ itemCount: 0, total: 0 });
    const topBar = harness.setTopBarActions.mock.lastCall?.[0] as ReactElement<{
      addLabel?: string;
      onAdd?: () => void;
    }>;

    expect(topBar.props.addLabel).toBe("Common.emptyState.cta");
    expect(topBar.props.onAdd).toEqual(expect.any(Function));
    expect(renderToStaticMarkup(topBar)).toContain('id="contacts-add"');
    expect(renderToStaticMarkup(topBar)).toContain('data-variant="default"');
    expect(html).toContain('data-variant="secondary"');

    topBar.props.onAdd?.();
    expect(harness.openEntity).toHaveBeenCalledWith(EntityType.contact, "new");
  });

  it("omits the Contacts topbar action for a read-only user", () => {
    renderState({ canManage: false, itemCount: 0, total: 0 });
    const topBar = harness.setTopBarActions.mock.lastCall?.[0] as ReactElement;

    expect(renderToStaticMarkup(topBar)).not.toContain('id="contacts-add"');
  });
});
