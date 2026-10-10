import type { ReactElement, ReactNode } from "react";

import { ViewMode } from "@/core/base/base-query-builder";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  contentProps: vi.fn(),
  generateInvite: vi.fn(),
  getRootStore: vi.fn(),
  inviteOpen: vi.fn(),
  layoutProps: vi.fn(),
  roleAdd: vi.fn(),
  roleEdit: vi.fn(),
  routineCreate: vi.fn(),
  routineEdit: vi.fn(),
  routerPush: vi.fn(),
  setTopBarActions: vi.fn(),
  sync: vi.fn(),
  toolbarProps: vi.fn(),
  userLoad: vi.fn(),
  webhookDeliveryInit: vi.fn(),
  webhookDeliveryOpen: vi.fn(),
  webhookOpen: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ push: harness.routerPush }),
}));

vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: harness.setTopBarActions,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: harness.getRootStore,
}));

vi.mock("@/components/data-view/use-data-view-sync", () => ({
  useDataViewSync: harness.sync,
}));

vi.mock("@/components/data-view/header/display-options", () => ({
  DataViewDisplayOptions: () => null,
}));

vi.mock("@/components/data-view/header/filter-popover", () => ({
  FilterPopover: () => null,
}));

vi.mock("@/components/data-view/data-view-toolbar", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<{
    DataViewToolbar: (props: Record<string, unknown>) => ReactElement | null;
  }>();

  return {
    ...actual,
    DataViewToolbar: (props: Record<string, unknown>) => {
      harness.toolbarProps(props);
      return React.createElement(actual.DataViewToolbar, props);
    },
  };
});

vi.mock("@/components/data-view/data-view-layout", () => ({
  DataViewLayout: ({ children, ...props }: { children: ReactNode }) => {
    harness.layoutProps(props);
    return createElement("div", { "data-data-view-layout": true }, children);
  },
}));

vi.mock("@/components/data-view/data-view-content", () => ({
  DataViewContent: (props: Record<string, unknown>) => {
    harness.contentProps(props);
    return createElement("div", { "data-data-view-content": true });
  },
}));

vi.mock("@/app/[locale]/(protected)/deals/components/use-deal-columns", () => ({
  useDealColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/services/components/use-service-columns", () => ({
  useServiceColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/tasks/components/use-task-columns", () => ({
  useTaskColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/settings/(workspace)/components/user/use-member-columns", () => ({
  useMemberColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/settings/(workspace)/components/role/use-role-columns", () => ({
  useRoleColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/settings/(workspace)/components/webhook/use-webhook-columns", () => ({
  useWebhookColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/settings/(workspace)/components/webhook/use-webhook-delivery-columns", () => ({
  useWebhookDeliveryColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/routines/components/use-routine-columns", () => ({
  useRoutineColumns: () => [],
}));

vi.mock("@/app/[locale]/(protected)/settings/(workspace)/components/role/role-modal", () => ({
  RoleModal: () => createElement("div", { "data-role-modal": true }),
}));

import { RolesPageView } from "@/app/[locale]/(protected)/settings/(workspace)/components/role/roles-page-view";
import { MembersPageView } from "@/app/[locale]/(protected)/settings/(workspace)/components/user/members-page-view";
import { WebhookDeliveriesPageView } from "@/app/[locale]/(protected)/settings/(workspace)/components/webhook/webhook-deliveries-page-view";
import { WebhooksPageView } from "@/app/[locale]/(protected)/settings/(workspace)/components/webhook/webhooks-page-view";
import { RoutinesPageView } from "@/app/[locale]/(protected)/routines/components/routines-page-view";

type Store = ReturnType<typeof store>;
type Fixture = {
  creator: boolean;
  name: string;
  render: (value: Store, initial: Result) => string;
  verifyAdd?: () => void;
  verifyRow: (props: Record<string, unknown>) => void;
  verifySync: (value: Store, initial: Result) => void;
};
type Result = {
  items: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function store(items: Array<Record<string, unknown>>, canManage = true) {
  return {
    canExport: true,
    canManage,
    customColumns: [],
    dataRequest: { status: "ready" as const },
    entityType: undefined,
    filters: [],
    groupableFields: [],
    grouping: null,
    groupingResult: undefined,
    isDisabled: !canManage,
    isGrouped: false,
    isReady: true,
    items,
    pagination: {
      page: 1,
      pageSize: 25,
      total: items.length,
      totalPages: items.length ? 1 : 0,
    },
    refreshQuery: vi.fn().mockResolvedValue(undefined),
    searchTerm: "",
    setItems: vi.fn(),
    setQueryOptions: vi.fn(),
    viewMode: ViewMode.table,
  };
}

const TRANSFERABLE_VIEWS = new Set(["Deals", "Services", "Tasks"]);

function countOf(html: string, needle: RegExp): number {
  return (html.match(needle) ?? []).length;
}

function expectOnlyTransferButtons(html: string) {
  expect(countOf(html, /<button/g)).toBe(countOf(html, /data-transfer-menu/g));
}

function result(items: Array<Record<string, unknown>>): Result {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 25,
      total: items.length,
      totalPages: items.length ? 1 : 0,
    },
  };
}

function setRoot(key: string, value: Store, extras: Record<string, unknown> = {}) {
  const root = {
    companyInviteModalStore: {
      generateInviteLink: harness.generateInvite,
      open: harness.inviteOpen,
    },
    roleModalStore: { add: harness.roleAdd, allows: () => false, editRole: harness.roleEdit },
    userModalStore: { loadById: harness.userLoad },
    webhookDeliveryModalStore: {
      onInitOrRefresh: harness.webhookDeliveryInit,
      open: harness.webhookDeliveryOpen,
    },
    routineModalStore: {
      openForCreate: harness.routineCreate,
      openForEdit: harness.routineEdit,
    },
    webhookModalStore: { allows: () => false, openWith: harness.webhookOpen },
    [key]: value,
    ...extras,
  };
  harness.getRootStore.mockReturnValue(root);
  return root;
}

const fixtures: Fixture[] = [
  {
    creator: true,
    name: "Members",
    render: (value, initial) => {
      setRoot("usersStore", value, { rolesStore: { setItems: vi.fn() } });
      return renderToStaticMarkup(
        createElement(MembersPageView, {
          initialRoles: result([]) as never,
          initialUsers: initial as never,
        }),
      );
    },
    verifyAdd: () => {
      expect(harness.generateInvite).toHaveBeenCalledTimes(1);
      expect(harness.inviteOpen).toHaveBeenCalledTimes(1);
    },
    verifyRow: (props) => {
      (props.onRowClick as (item: { id: string }) => void)({ id: "row" });
      expect(harness.userLoad).toHaveBeenCalledWith("row");
    },
    verifySync: (value, initial) => expect(harness.sync).toHaveBeenCalledWith(value, initial),
  },
  {
    creator: true,
    name: "Roles",
    render: (value, initial) => {
      setRoot("rolesStore", value);
      return renderToStaticMarkup(createElement(RolesPageView, { initialRoles: initial as never }));
    },
    verifyAdd: () => expect(harness.roleAdd).toHaveBeenCalledTimes(1),
    verifyRow: (props) => {
      const role = { id: "row" };
      (props.onRowClick as (item: typeof role) => void)(role);
      expect(harness.roleEdit).toHaveBeenCalledExactlyOnceWith(role);
    },
    verifySync: () => expect(harness.sync).not.toHaveBeenCalled(),
  },
  {
    creator: true,
    name: "Webhooks",
    render: (value, initial) => {
      setRoot("webhooksStore", value);
      return renderToStaticMarkup(createElement(WebhooksPageView, { initialWebhooks: initial as never }));
    },
    verifyAdd: () =>
      expect(harness.webhookOpen).toHaveBeenCalledWith({
        id: undefined,
        recordTrigger: null,
        recordOwnerUserId: undefined,
        url: "",
        description: undefined,
        events: [],
        secret: undefined,
        headers: "",
        bodyTemplate: undefined,
        enabled: true,
      }),
    verifyRow: (props) => {
      const item = {
        id: "row",
        url: "https://example.com",
        description: null,
        events: [],
        secret: null,
        enabled: true,
      };
      (props.onRowClick as (value: typeof item) => void)(item);
      expect(harness.webhookOpen).toHaveBeenCalledWith({
        id: "row",
        recordTrigger: null,
        recordSources: null,
        recordOwnerUserId: undefined,
        url: "https://example.com",
        description: undefined,
        events: [],
        secret: undefined,
        headers: "",
        bodyTemplate: undefined,
        enabled: true,
        pausedReason: null,
      });
      const actions = (
        props.rowActions as (value: typeof item) => { props: { contextAction: { onSelect: () => void } } }
      )(item);
      actions.props.contextAction.onSelect();
      expect(harness.routerPush).toHaveBeenCalledExactlyOnceWith(
        "/settings/webhook-deliveries?filters=webhookId%3Ain%3Arow",
      );
    },
    verifySync: (value, initial) => expect(harness.sync).toHaveBeenCalledWith(value, initial),
  },
  {
    creator: false,
    name: "Webhook Deliveries",
    render: (value, initial) => {
      setRoot("webhookDeliveriesStore", value);
      return renderToStaticMarkup(
        createElement(WebhookDeliveriesPageView, {
          initialDeliveries: initial as never,
        }),
      );
    },
    verifyRow: (props) => {
      const item = { id: "row" };
      (props.onRowClick as (value: typeof item) => void)(item);
      expect(harness.webhookDeliveryInit).toHaveBeenCalledWith(item);
      expect(harness.webhookDeliveryOpen).toHaveBeenCalledTimes(1);
    },
    verifySync: (value, initial) => expect(harness.sync).toHaveBeenCalledWith(value, initial),
  },
  {
    creator: true,
    name: "Routines",
    render: (value, initial) => {
      setRoot("routinesStore", value);
      return renderToStaticMarkup(createElement(RoutinesPageView, { initialRoutines: initial as never }));
    },
    verifyAdd: () => expect(harness.routineCreate).toHaveBeenCalledTimes(1),
    verifyRow: (props) => {
      const item = { id: "row", name: "Weekly digest" };
      (props.onRowClick as (value: typeof item) => void)(item);
      expect(harness.routineEdit).toHaveBeenCalledWith(item);
    },
    verifySync: (value, initial) => expect(harness.sync).toHaveBeenCalledWith(value, initial),
  },
];

describe("migrated collection page wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(fixtures)("preserves $name content, sync, pagination, and row behavior", (fixture) => {
    const item = { id: "row" };
    const initial = result([item]);
    const value = store([item]);
    value.dataRequest = {
      status: "refresh-error",
      error: new Error("retained"),
    } as never;
    const html = fixture.render(value, initial);
    const content = harness.contentProps.mock.lastCall?.[0] as Record<string, unknown>;
    const layout = harness.layoutProps.mock.lastCall?.[0] as {
      showPagination: boolean;
      store: unknown;
    };

    expect(html).toContain('data-data-view-content="true"');
    expect(content.store).toBe(value);
    expect(content.view).toBe("table");
    expect(layout.showPagination).toBe(true);
    expect(layout.store).toBe(value);
    fixture.verifySync(value, initial);
    fixture.verifyRow(content);
  });

  it.each(fixtures)("hands $name pagination back to the group rows once the surface is grouped", (fixture) => {
    const item = { id: "row" };
    const value = store([item]);
    value.isGrouped = true;
    fixture.render(value, result([item]));
    const layout = harness.layoutProps.mock.lastCall?.[0] as {
      showPagination: boolean;
    };

    expect(layout.showPagination).toBe(false);
  });

  it.each(fixtures)("renders the complete $name page-state contract", (fixture) => {
    const cases = [
      {
        expected: 'data-page-state="loading"',
        request: { status: "uninitialized" },
      },
      {
        expected: 'data-page-state="loading"',
        items: [{ id: "row" }],
        request: { status: "refreshing" },
      },
      {
        expected: 'data-page-state="error"',
        request: { status: "refresh-error", error: new Error("failed") },
      },
      {
        expected: "Common.emptyState.filteredTitle",
        hasActiveQuery: true,
        request: { status: "ready" },
      },
      {
        expected: 'data-page-state="empty"',
        request: { status: "ready" },
      },
      {
        expected: 'data-data-view-content="true"',
        items: [{ id: "row" }],
        request: { status: "ready" },
      },
    ] as const;

    for (const state of cases) {
      vi.clearAllMocks();
      const items = "items" in state ? [...state.items] : [];
      const initial = result(items);
      const value = store(items);
      value.dataRequest = state.request as never;
      if ("hasActiveQuery" in state) value.filters = [{}] as never;

      const html = fixture.render(value, initial);

      expect(html, `${fixture.name}:${state.request.status}`).toContain(state.expected);
      if (state.request.status !== "ready" || items.length === 0)
        expect(html, `${fixture.name}:${state.request.status}:content`).not.toContain('data-data-view-content="true"');
    }
  });

  it.each(fixtures)("preserves $name action hierarchy and permissions", (fixture) => {
    const initial = result([]);
    const value = store([]);
    const html = fixture.render(value, initial);
    const topBar = renderToStaticMarkup(harness.setTopBarActions.mock.lastCall?.[0] as ReactElement);
    const toolbar = harness.toolbarProps.mock.lastCall?.[0] as {
      onAdd?: () => void;
    };

    expect(html, `${fixture.name}: the view rail is layout owned, not page owned`).not.toContain("data-data-view-rail");

    if (fixture.creator) {
      expect(html).toContain('data-variant="secondary"');
      expect(topBar).toContain('data-variant="default"');
      toolbar.onAdd?.();
      fixture.verifyAdd?.();
    } else {
      expect(html).not.toContain("<button");
      expect(topBar).not.toContain("<button");
      expect(toolbar.onAdd).toBeUndefined();
    }

    vi.clearAllMocks();
    const readOnly = store([], false);
    const readOnlyHtml = fixture.render(readOnly, initial);
    const readOnlyTopBar = renderToStaticMarkup(harness.setTopBarActions.mock.lastCall?.[0] as ReactElement);
    expect(readOnlyHtml, `${fixture.name}: the view rail is layout owned, not page owned`).not.toContain(
      "data-data-view-rail",
    );
    expectOnlyTransferButtons(readOnlyHtml);
    expectOnlyTransferButtons(readOnlyTopBar);
    expect(readOnlyTopBar.includes("data-transfer-menu")).toBe(TRANSFERABLE_VIEWS.has(fixture.name));
  });

  it("keeps the board and its grouping prompt off screen while a view switch is in flight", () => {
    const item = { id: "row" };
    const value = store([item]);
    value.dataRequest = { status: "refreshing" } as never;
    value.viewMode = ViewMode.card;
    (value as unknown as { canBoard: boolean }).canBoard = true;
    const html = fixtures.find(({ name }) => name === "Members")?.render(value, result([item])) ?? "";

    expect(html).toContain('data-page-state="loading"');
    expect(html).toContain('data-skeleton-view="board"');
    expect(html).not.toContain('data-data-view-content="true"');
    expect(harness.contentProps).not.toHaveBeenCalled();
  });

  it("keeps Roles off URL sync and makes its rejected retry caller-safe", () => {
    const initial = result([]);
    const value = store([]);
    value.dataRequest = {
      status: "refresh-error",
      error: new Error("failed"),
    } as never;
    value.refreshQuery.mockRejectedValue(new Error("failed"));
    const html = fixtures.find(({ name }) => name === "Roles")?.render(value, initial) ?? "";
    renderToStaticMarkup(harness.setTopBarActions.mock.lastCall?.[0] as ReactElement);
    const toolbar = harness.toolbarProps.mock.lastCall?.[0] as {
      searchLabel?: string;
    };

    expect(html).toContain('data-page-state="error"');
    expect(toolbar.searchLabel).toBeUndefined();
    expect(harness.sync).not.toHaveBeenCalled();
  });
});
