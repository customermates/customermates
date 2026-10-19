import type { PageStateProps } from "@/components/page-state/page-state";
import type { WidgetDto } from "@/features/widget/widget.schema";
import type { ReactElement, ReactNode } from "react";

import { WidgetKind } from "@/generated/prisma";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  add: vi.fn(),
  getRootStore: vi.fn(),
  gridProps: vi.fn(),
  isTouchDevice: false,
  onLayoutChange: vi.fn(),
  pageStateProps: vi.fn(),
  push: vi.fn(),
  refreshQuery: vi.fn(),
  setTopBarActions: vi.fn(),
}));

vi.mock("@/components/data-view/views/data-view-views-rail", () => ({ DataViewViewsRail: () => null }));
vi.mock("@/components/data-view/data-view-url-sync", () => ({ connectDataViewUrlSync: () => () => undefined }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ children, ...props }: { children?: ReactNode }) => {
      harness.gridProps(props);
      return createElement("div", { "data-responsive-grid": true }, children);
    },
}));

vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: harness.setTopBarActions,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: harness.getRootStore,
}));

vi.mock("@/hooks/use-touch-input", () => ({
  useTouchInput: () => harness.isTouchDevice,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: harness.push }),
}));

vi.mock("@/components/page-state/page-state", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<{
    PageState: (props: PageStateProps) => ReactElement;
  }>();

  return {
    ...actual,
    PageState: (props: Parameters<typeof actual.PageState>[0]) => {
      harness.pageStateProps(props);
      return React.createElement(actual.PageState, props);
    },
  };
});

vi.mock("../widget-card", () => ({
  WidgetCard: ({ widget }: { widget: WidgetDto }) => createElement("div", { "data-widget-card": widget.id }),
}));

vi.mock("../widget-modal", () => ({
  WidgetModal: () => createElement("div", { "data-widget-modal": true }),
}));

import { DashboardPageView } from "../dashboard-page-view";

type RequestStatus = "uninitialized" | "ready" | "refresh-error";

function request(status: RequestStatus) {
  return status === "refresh-error" ? { status, error: new Error("failed") } : { status };
}

function widget(): WidgetDto {
  return { id: "widget-1" } as WidgetDto;
}

function renderDashboard(
  status: RequestStatus,
  options: {
    canAdd?: boolean;
    touch?: boolean;
    withItem?: boolean;
    navigation?: { canManageSchema: boolean; hasLists: boolean; types: unknown[] } | null;
  } = {},
) {
  const items = options.withItem ? [widget()] : [];
  const widgetsStore = {
    dataRequest: request(status),
    items,
    layouts: {},
    onLayoutChange: harness.onLayoutChange,
    refreshQuery: harness.refreshQuery,
    setItems: vi.fn(),
  };
  const widgetModalStore = {
    add: harness.add,
    availableEntityTypes: options.canAdd === false ? [] : ["contact"],
    availableKinds: options.canAdd === false ? [] : [WidgetKind.chart],
    loadById: vi.fn(),
    setExpandedSection: vi.fn(),
  };
  harness.isTouchDevice = options.touch ?? false;
  harness.getRootStore.mockReturnValue({
    widgetModalStore,
    widgetsStore,
    recordWorkspaceStore: { navigation: options.navigation ?? null },
  });

  return renderToStaticMarkup(
    createElement(DashboardPageView, {
      dashboard: {
        p13nId: "dashboard",
        items,
        views: [],
        activeViewKey: "__all__",
        allState: {},
        viewPersistable: true,
      },
    }),
  );
}

function latestTopBar() {
  return harness.setTopBarActions.mock.lastCall?.[0] as ReactElement | null;
}

describe("DashboardPageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.isTouchDevice = false;
  });

  it("renders one accessible animated loading branch and keeps the modal mounted", () => {
    const html = renderDashboard("uninitialized");

    expect(html).toContain('data-page-state="loading"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-dashboard-page-skeleton="true"');
    expect(html).toContain("data-skeleton-motion");
    expect(html).toContain('data-widget-modal="true"');
    expect(latestTopBar()).toBeNull();
  });

  it("renders an actionable error branch and keeps the modal mounted", () => {
    harness.refreshQuery.mockRejectedValue(new Error("failed"));
    const html = renderDashboard("refresh-error");
    const errorProps = harness.pageStateProps.mock.calls.find(([props]) => props.state === "error")?.[0];
    const retry = errorProps?.action as ReactElement<{ onClick: () => void }>;

    expect(html).toContain('data-page-state="error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-widget-modal="true"');
    retry.props.onClick();
    expect(harness.refreshQuery).toHaveBeenCalledTimes(1);
  });

  it("keeps the topbar action primary and the true-empty action secondary", () => {
    const html = renderDashboard("ready");
    const topBar = latestTopBar();

    expect(html).toContain('data-page-state="empty"');
    expect(html).toContain('data-page-skeleton-empty="true"');
    expect(html).toContain('data-variant="secondary"');
    expect(html).toContain('data-widget-modal="true"');
    expect(renderToStaticMarkup(topBar as ReactElement)).toContain('data-variant="default"');
    expect(renderToStaticMarkup(topBar as ReactElement)).toContain('id="dashboard-add-widget"');
  });

  it("keeps the compact Add widget action named when its visible label is hidden", () => {
    renderDashboard("ready", { withItem: true });
    const topBar = renderToStaticMarkup(latestTopBar() as ReactElement);

    expect(topBar).toContain('aria-label="Dashboard.addCard"');
    expect(topBar).toContain('<span class="hidden sm:inline">Dashboard.addCard</span>');
  });

  it("offers Create list to people who manage the data model of a workspace without lists", () => {
    const html = renderDashboard("ready", { navigation: { canManageSchema: true, hasLists: false, types: [] } });
    const props = harness.pageStateProps.mock.lastCall?.[0] as PageStateProps & {
      action: ReactElement<{ onClick: () => void }>;
    };

    expect(html).toContain('data-page-state="empty"');
    expect(html).toContain("RecordModel.createList");
    expect(html).toContain("Common.emptyState.dashboardNoListsBody");
    props.action.props.onClick();
    expect(harness.push).toHaveBeenCalledWith("/configure?create=true");
  });

  it("keeps the widget action when lists exist, even hidden or unreadable, or the data model is managed by others", () => {
    for (const navigation of [
      { canManageSchema: true, hasLists: true, types: [{ id: "projects" }] },
      { canManageSchema: true, hasLists: true, types: [] },
      { canManageSchema: false, hasLists: false, types: [] },
    ]) {
      const html = renderDashboard("ready", { navigation });

      expect(html).not.toContain("RecordModel.createList");
      expect(html).toContain("Common.emptyState.dashboardBody");
    }
  });

  it("omits both add actions without widget permissions", () => {
    const html = renderDashboard("ready", { canAdd: false });

    expect(html).toContain('data-page-state="empty"');
    expect(html).not.toContain("<button");
    expect(latestTopBar()).toBeNull();
  });

  it.each([
    [false, true],
    [true, false],
  ])("renders loaded grid content with touch=%s and draggable=%s", (touch, draggable) => {
    const html = renderDashboard("ready", { touch, withItem: true });
    const props = harness.gridProps.mock.lastCall?.[0] as {
      isDraggable: boolean;
      onLayoutChange: (layout: unknown[], layouts: Record<string, unknown>) => void;
    };

    expect(html).toContain('data-responsive-grid="true"');
    expect(html).toContain('data-widget-card="widget-1"');
    expect(html).toContain('data-widget-modal="true"');
    expect(props.isDraggable).toBe(draggable);
    props.onLayoutChange([], {});
    expect(harness.onLayoutChange).toHaveBeenCalledWith([], {});
  });
});
