// @vitest-environment jsdom

import type { WidgetDto } from "@/features/widget/widget.schema";
import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  focusedAtOpen: null as Element | null,
  loadById: vi.fn(),
}));

vi.mock("@/components/data-view/views/data-view-views-rail", () => ({ DataViewViewsRail: () => null }));
vi.mock("@/components/data-view/use-data-view-sync", () => ({ useDataViewSync: () => undefined }));
vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) => (values?.name ? `${key}:${values.name}` : key),
}));
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ children }: { children?: ReactNode }) =>
      createElement("div", { "data-responsive-grid": true }, children),
}));
vi.mock("@/app/components/topbar-actions-context", () => ({ useSetTopBarActions: vi.fn() }));
vi.mock("@/app/components/agent-chat/suggested-questions", () => ({ AgentStarterActions: () => null }));
vi.mock("@/core/utils/use-is-touch-device", () => ({ useIsTouchDevice: () => false }));
vi.mock("@/app/[locale]/(protected)/dashboard/components/chart-widget-card", () => ({
  ChartWidgetCard: ({ widget }: { widget: WidgetDto }) =>
    createElement("div", { "data-chart": widget.id }, widget.name),
}));
vi.mock("@/app/[locale]/(protected)/dashboard/components/activity-widget-card", () => ({
  ActivityWidgetCard: ({ widget }: { widget: WidgetDto }) =>
    createElement("div", { "data-activity": widget.id }, widget.name),
}));
vi.mock("@/app/[locale]/(protected)/dashboard/components/record-widget-card", () => ({
  RecordWidgetCard: (widget: WidgetDto) => createElement("div", { "data-record-chart": widget.id }, widget.name),
}));
vi.mock("@/app/[locale]/(protected)/dashboard/components/record-activity-widget-card", () => ({
  RecordActivityWidgetCard: ({ widget }: { widget: WidgetDto }) =>
    createElement("div", { "data-record-activity": widget.id }, widget.name),
}));
vi.mock("@/app/[locale]/(protected)/dashboard/components/widget-modal", () => ({ WidgetModal: () => null }));
vi.mock("@/core/stores/root-store.provider", () => {
  const widget = { id: "widget-1", name: "Total Deal Value", kind: "chart", contractVersion: 2 };
  const widgetModalStore = {
    add: vi.fn(),
    availableKinds: ["chart"],
    availableEntityTypes: ["contact"],
    loadById: (id: string) => {
      harness.focusedAtOpen = document.activeElement;
      harness.loadById(id);
    },
    setExpandedFilterField: vi.fn(),
    setExpandedSection: vi.fn(),
  };
  const widgetsStore = {
    dataRequest: { status: "ready" },
    items: [widget],
    layouts: {},
    onLayoutChange: vi.fn(),
    refreshQuery: vi.fn(),
    setItems: vi.fn(),
  };
  return { useRootStore: () => ({ widgetModalStore, widgetsStore }) };
});

import { DashboardPageView } from "@/app/[locale]/(protected)/dashboard/components/dashboard-page-view";

let container: HTMLDivElement;
let reactRoot: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.focusedAtOpen = null;
  harness.loadById.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  document.body.replaceChildren();
});

describe("DashboardPageView widget opening", () => {
  it("moves focus to the widget's edit button before a pointer click opens the editor, so closing it can return there", async () => {
    act(() =>
      reactRoot.render(
        createElement(DashboardPageView, {
          dashboard: {
            p13nId: "dashboard",
            items: [],
            views: [],
            activeViewKey: "__all__",
            allState: {},
            viewPersistable: true,
          },
        }),
      ),
    );
    const chart = container.querySelector<HTMLElement>(
      '[data-record-chart="widget-1"], [data-record-activity="widget-1"]',
    );
    const editButton = container.querySelector<HTMLElement>('[data-slot="widget-card-open"]');
    if (!chart || !editButton) throw new Error("Expected the widget card and its edit button");

    await act(async () => {
      chart.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 40, clientY: 40 }));
      document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 41, clientY: 41 }));
      await Promise.resolve();
    });

    expect(harness.loadById).toHaveBeenCalledWith("widget-1");
    expect(harness.focusedAtOpen).toBe(editButton);
  });
});
