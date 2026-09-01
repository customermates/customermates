import type { ReactElement, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";
import { ViewMode } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({
  auditInit: vi.fn(),
  auditOpen: vi.fn(),
  contentProps: vi.fn(),
  generateInvite: vi.fn(),
  getRootStore: vi.fn(),
  inviteOpen: vi.fn(),
  layoutProps: vi.fn(),
  openEntity: vi.fn(),
  roleAdd: vi.fn(),
  roleOpen: vi.fn(),
  roleSet: vi.fn(),
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

vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: harness.setTopBarActions,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: harness.getRootStore,
}));

vi.mock("@/components/data-view/use-data-view-sync", () => ({
  useDataViewSync: harness.sync,
}));

vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useEntityHref: () => (entityType: EntityType, id: string) => `/${entityType}/${id}`,
  useOpenEntity: () => harness.openEntity,
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entityType: EntityType) => `${entityType}-plural`,
    singular: (entityType: EntityType) => entityType,
  }),
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

vi.mock("@/components/data-view/data-view-toolbar", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<{ DataViewToolbar: (props: Record<string, unknown>) => ReactElement | null }>();

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

vi.mock("@/app/[locale]/(protected)/deals/components/use-deal-columns", () => ({ useDealColumns: () => [] }));
vi.mock("@/app/[locale]/(protected)/services/components/use-service-columns", () => ({
  useServiceColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/tasks/components/use-task-columns", () => ({ useTaskColumns: () => [] }));
vi.mock("@/app/[locale]/(protected)/company/components/user/use-member-columns", () => ({
  useMemberColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/company/components/role/use-role-columns", () => ({
  useRoleColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/company/components/audit-log/use-audit-log-columns", () => ({
  useAuditLogColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/company/components/webhook/use-webhook-columns", () => ({
  useWebhookColumns: () => [],
}));
vi.mock("@/app/[locale]/(protected)/company/components/webhook/use-webhook-delivery-columns", () => ({
  useWebhookDeliveryColumns: () => [],
}));

vi.mock("@/app/[locale]/(protected)/company/components/role/role-modal", () => ({
  RoleModal: () => createElement("div", { "data-role-modal": true }),
}));

import { AuditLogsPageView } from "@/app/[locale]/(protected)/company/components/audit-log/audit-logs-page-view";
import { RolesPageView } from "@/app/[locale]/(protected)/company/components/role/roles-page-view";
import { MembersPageView } from "@/app/[locale]/(protected)/company/components/user/members-page-view";
import { WebhookDeliveriesPageView } from "@/app/[locale]/(protected)/company/components/webhook/webhook-deliveries-page-view";
import { WebhooksPageView } from "@/app/[locale]/(protected)/company/components/webhook/webhooks-page-view";
import { DealsPageView } from "@/app/[locale]/(protected)/deals/components/deals-page-view";
import { ServicesPageView } from "@/app/[locale]/(protected)/services/components/services-page-view";
import { TasksPageView } from "@/app/[locale]/(protected)/tasks/components/tasks-page-view";

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
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

function store(items: Array<Record<string, unknown>>, canManage = true) {
  return {
    canExport: true,
    canManage,
    customColumns: [],
    dataRequest: { status: "ready" as const },
    entityType: undefined,
    filters: [],
    groupingColumnId: null,
    isDisabled: !canManage,
    isReady: true,
    items,
    pagination: { page: 1, pageSize: 25, total: items.length, totalPages: items.length ? 1 : 0 },
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
    pagination: { page: 1, pageSize: 25, total: items.length, totalPages: items.length ? 1 : 0 },
  };
}

function setRoot(key: string, value: Store, extras: Record<string, unknown> = {}) {
  const root = {
    auditLogModalStore: { onInitOrRefresh: harness.auditInit, open: harness.auditOpen },
    companyInviteModalStore: { generateInviteLink: harness.generateInvite, open: harness.inviteOpen },
    roleModalStore: { add: harness.roleAdd, open: harness.roleOpen, setRole: harness.roleSet },
    userModalStore: { loadById: harness.userLoad },
    webhookDeliveryModalStore: {
      onInitOrRefresh: harness.webhookDeliveryInit,
      open: harness.webhookDeliveryOpen,
    },
    webhookModalStore: { openWith: harness.webhookOpen },
    [key]: value,
    ...extras,
  };
  harness.getRootStore.mockReturnValue(root);
  return root;
}

const fixtures: Fixture[] = [
  {
    creator: true,
    name: "Deals",
    render: (value, initial) => {
      const linked = { contactsStore: {}, organizationsStore: {}, servicesStore: {} };
      setRoot("dealsStore", value, linked);
      return renderToStaticMarkup(createElement(DealsPageView, { deals: initial as never }));
    },
    verifyAdd: () => expect(harness.openEntity).toHaveBeenCalledWith(EntityType.deal, "new"),
    verifyRow: (props) => expect((props.rowHref as (item: { id: string }) => string)({ id: "row" })).toBe("/deal/row"),
    verifySync: (value, initial) => {
      const root = harness.getRootStore.mock.results.at(-1)?.value;
      expect(harness.sync).toHaveBeenCalledWith(value, initial, [
        root.organizationsStore,
        root.contactsStore,
        root.servicesStore,
      ]);
    },
  },
  {
    creator: true,
    name: "Services",
    render: (value, initial) => {
      const linked = { dealsStore: {} };
      setRoot("servicesStore", value, linked);
      return renderToStaticMarkup(createElement(ServicesPageView, { services: initial as never }));
    },
    verifyAdd: () => expect(harness.openEntity).toHaveBeenCalledWith(EntityType.service, "new"),
    verifyRow: (props) =>
      expect((props.rowHref as (item: { id: string }) => string)({ id: "row" })).toBe("/service/row"),
    verifySync: (value, initial) => {
      const root = harness.getRootStore.mock.results.at(-1)?.value;
      expect(harness.sync).toHaveBeenCalledWith(value, initial, [root.dealsStore]);
    },
  },
  {
    creator: true,
    name: "Tasks",
    render: (value, initial) => {
      setRoot("tasksStore", value);
      return renderToStaticMarkup(createElement(TasksPageView, { tasks: initial as never }));
    },
    verifyAdd: () => expect(harness.openEntity).toHaveBeenCalledWith(EntityType.task, "new"),
    verifyRow: (props) => expect((props.rowHref as (item: { id: string }) => string)({ id: "row" })).toBe("/task/row"),
    verifySync: (value, initial) => expect(harness.sync).toHaveBeenCalledWith(value, initial),
  },
  {
    creator: true,
    name: "Members",
    render: (value, initial) => {
      setRoot("usersStore", value, { rolesStore: { setItems: vi.fn() } });
      return renderToStaticMarkup(
        createElement(MembersPageView, { initialRoles: result([]) as never, initialUsers: initial as never }),
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
      expect(harness.roleSet).toHaveBeenCalledWith(role);
      expect(harness.roleOpen).toHaveBeenCalledTimes(1);
    },
    verifySync: () => expect(harness.sync).not.toHaveBeenCalled(),
  },
  {
    creator: false,
    name: "Audit Logs",
    render: (value, initial) => {
      setRoot("auditLogsStore", value);
      return renderToStaticMarkup(createElement(AuditLogsPageView, { initialAuditLogs: initial as never }));
    },
    verifyRow: (props) => {
      const item = { id: "row" };
      (props.onRowClick as (value: typeof item) => void)(item);
      expect(harness.auditInit).toHaveBeenCalledWith(item);
      expect(harness.auditOpen).toHaveBeenCalledTimes(1);
    },
    verifySync: (value, initial) => expect(harness.sync).toHaveBeenCalledWith(value, initial),
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
        url: "",
        description: undefined,
        events: [],
        secret: undefined,
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
        url: "https://example.com",
        description: undefined,
        events: [],
        secret: undefined,
        enabled: true,
      });
    },
    verifySync: (value, initial) => expect(harness.sync).toHaveBeenCalledWith(value, initial),
  },
  {
    creator: false,
    name: "Webhook Deliveries",
    render: (value, initial) => {
      setRoot("webhookDeliveriesStore", value);
      return renderToStaticMarkup(createElement(WebhookDeliveriesPageView, { initialDeliveries: initial as never }));
    },
    verifyRow: (props) => {
      const item = { id: "row" };
      (props.onRowClick as (value: typeof item) => void)(item);
      expect(harness.webhookDeliveryInit).toHaveBeenCalledWith(item);
      expect(harness.webhookDeliveryOpen).toHaveBeenCalledTimes(1);
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
    value.dataRequest = { status: "refresh-error", error: new Error("retained") } as never;
    const html = fixture.render(value, initial);
    const content = harness.contentProps.mock.lastCall?.[0] as Record<string, unknown>;
    const layout = harness.layoutProps.mock.lastCall?.[0] as { showPagination: boolean };

    expect(html).toContain('data-data-view-content="true"');
    expect(content.store).toBe(value);
    expect(content.view).toBe("table");
    expect(layout.showPagination).toBe(true);
    fixture.verifySync(value, initial);
    fixture.verifyRow(content);
  });

  it.each(fixtures)("renders the complete $name page-state contract", (fixture) => {
    const cases = [
      {
        expected: 'data-page-state="loading"',
        request: { status: "uninitialized" },
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
    const toolbar = harness.toolbarProps.mock.lastCall?.[0] as { onAdd?: () => void };

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
    expectOnlyTransferButtons(readOnlyHtml);
    expectOnlyTransferButtons(readOnlyTopBar);
    expect(readOnlyTopBar.includes("data-transfer-menu")).toBe(TRANSFERABLE_VIEWS.has(fixture.name));
  });

  it("keeps Roles off URL sync and makes its rejected retry caller-safe", () => {
    const initial = result([]);
    const value = store([]);
    value.dataRequest = { status: "refresh-error", error: new Error("failed") } as never;
    value.refreshQuery.mockRejectedValue(new Error("failed"));
    const html = fixtures.find(({ name }) => name === "Roles")?.render(value, initial) ?? "";
    renderToStaticMarkup(harness.setTopBarActions.mock.lastCall?.[0] as ReactElement);
    const toolbar = harness.toolbarProps.mock.lastCall?.[0] as { isSearchable: boolean };

    expect(html).toContain('data-page-state="error"');
    expect(toolbar.isSearchable).toBe(false);
    expect(harness.sync).not.toHaveBeenCalled();
  });
});
