"use client";

import type { DiscoveredRecordTypes } from "@/features/records/discover-record-types.interactor";
import type { WidgetGallery } from "@/features/widget/widget-gallery";
import type { WidgetDto } from "@/features/widget/widget.schema";
import type { ComponentType, ReactNode } from "react";
import type { Layout, ResponsiveLayouts } from "react-grid-layout/legacy";

import { BarChart3, Plus } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import "@/styles/react-grid-layout.css";

import { AgentStarterActions } from "@/app/components/agent-chat/suggested-questions";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { PageState } from "@/components/page-state/page-state";
import { resolveResourcePageState } from "@/components/page-state/resource-page-state";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useIsTouchDevice } from "@/core/utils/use-is-touch-device";

import { DashboardPageSkeleton } from "./dashboard-page-skeleton";
import { DASHBOARD_GRID_MARGIN, DASHBOARD_ROW_HEIGHT, GRID_BREAKPOINTS, GRID_COLS } from "./grid.constants";
import { WidgetCard } from "./widget-card";
import {
  isInteractiveTarget,
  isWidgetOpeningClick,
  openWidgetEditor,
  WIDGET_INTERACTIVE_SELECTOR,
} from "./widget-interaction";
import { WidgetModal } from "./widget-modal";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { useFocusTarget, type FocusKind } from "@/components/focus/focus-target";

const ResponsiveGridLayout = dynamic(
  () =>
    import("react-grid-layout/legacy").then(
      ({ Responsive, WidthProvider }) => WidthProvider(Responsive) as ComponentType<any>,
    ),
  { ssr: false },
);

type Props = {
  gallery?: WidgetGallery;
  recordTypes?: DiscoveredRecordTypes;
  widgets: WidgetDto[];
};

const WIDGET_FOCUS_KINDS: FocusKind[] = ["widget"];

const DashboardPageViewContent = observer(function DashboardPageView({ gallery, recordTypes, widgets }: Props) {
  const { widgetModalStore, widgetsStore } = useRootStore();
  const { items, layouts } = widgetsStore;
  const canAddWidget = widgetModalStore.availableKinds.length > 0;
  useEffect(() => {
    if (recordTypes) widgetModalStore.setRecordTypes(recordTypes, gallery);
  }, [gallery, recordTypes, widgetModalStore]);
  const isTouchDevice = useIsTouchDevice();
  const pointerStart = useRef<{
    id: string;
    x: number;
    y: number;
    interactive: boolean;
    opener: HTMLElement | null;
  } | null>(null);
  const t = useTranslations();

  useLayoutEffect(() => widgetsStore.setItems({ items: widgets }), [widgets, widgetsStore]);

  useEffect(() => {
    if (typeof window === "undefined" || items.length === 0) return;
    const first = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    return () => cancelAnimationFrame(first);
  }, [items.length]);

  useEffect(() => {
    function onPointerUp(event: PointerEvent) {
      if (!pointerStart.current) return;
      const { id, x, y, interactive, opener } = pointerStart.current;
      pointerStart.current = null;
      if (
        isWidgetOpeningClick({
          startX: x,
          startY: y,
          endX: event.clientX,
          endY: event.clientY,
          startedOnInteractive: interactive,
        })
      ) {
        opener?.focus({ preventScroll: true });
        runUserAction(() => openWidgetEditor(widgetModalStore, id));
      }
    }
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, [widgetModalStore]);

  const handlePointerDown = useCallback((id: string, event: React.PointerEvent) => {
    pointerStart.current = {
      id,
      x: event.clientX,
      y: event.clientY,
      interactive: isInteractiveTarget(event.target),
      opener: event.currentTarget.querySelector<HTMLElement>('[data-slot="widget-card-open"]'),
    };
  }, []);
  const pageState = resolveResourcePageState(widgetsStore.dataRequest, items.length);
  useFocusTarget(
    WIDGET_FOCUS_KINDS,
    (target) => {
      runUserAction(() => openWidgetEditor(widgetModalStore, target.id));
      return true;
    },
    pageState === "content",
  );
  const topBarActions = useMemo(
    () =>
      pageState !== "loading" && pageState !== "error" && canAddWidget ? (
        <div className="flex items-center gap-1">
          <Button
            aria-label={t("Dashboard.addCard")}
            id="dashboard-add-widget"
            size="sm"
            variant="default"
            onClick={() => widgetModalStore.add(t("Dashboard.activityWidget.title"))}
          >
            <Icon icon={Plus} />

            <span className="hidden sm:inline">{t("Dashboard.addCard")}</span>
          </Button>
        </div>
      ) : null,
    [canAddWidget, pageState, t, widgetModalStore],
  );
  useSetTopBarActions(topBarActions);

  let body: ReactNode;
  switch (pageState) {
    case "loading":
      body = <PageState background={<DashboardPageSkeleton />} label={t("PageState.loading")} state="loading" />;
      break;
    case "error":
      body = (
        <PageState
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => runUserAction(() => widgetsStore.refreshQuery().catch(() => undefined))}
            >
              {t("ErrorCard.retry")}
            </Button>
          }
          description={t("ErrorCard.contactSupport")}
          state="error"
          title={t("ErrorCard.title")}
        />
      );
      break;
    case "true-empty":
      body = (
        <PageState
          action={
            <AgentStarterActions
              fallback={
                canAddWidget ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => widgetModalStore.add(t("Dashboard.activityWidget.title"))}
                  >
                    {t("Dashboard.addCard")}
                  </Button>
                ) : undefined
              }
              pageId="dashboard"
              state="empty"
              surface="page"
            />
          }
          background={<DashboardPageSkeleton animated={false} />}
          description={t("Common.emptyState.dashboardBody")}
          icon={BarChart3}
          state="empty"
          title={t("Common.emptyState.dashboardTitle")}
        />
      );
      break;
    case "content":
      body = (
        <ResponsiveGridLayout
          isResizable
          breakpoints={GRID_BREAKPOINTS}
          className={
            isTouchDevice
              ? "layout touch-scrollable animate-page-result-in motion-reduce:animate-none"
              : "layout animate-page-result-in motion-reduce:animate-none"
          }
          cols={GRID_COLS}
          compactType="vertical"
          containerPadding={[0, 0]}
          draggableCancel={WIDGET_INTERACTIVE_SELECTOR}
          isDraggable={!isTouchDevice}
          layouts={layouts}
          margin={[DASHBOARD_GRID_MARGIN, DASHBOARD_GRID_MARGIN]}
          resizeHandles={["n", "s", "e", "w", "ne", "nw", "se", "sw"]}
          rowHeight={DASHBOARD_ROW_HEIGHT}
          onLayoutChange={(layout: Layout, nextLayouts: ResponsiveLayouts) =>
            widgetsStore.onLayoutChange(layout, nextLayouts)
          }
        >
          {items.map((widget) => (
            <div
              key={widget.id}
              data-focus-target={`widget:${widget.id}`}
              onPointerDown={(event) => handlePointerDown(widget.id, event)}
            >
              <WidgetCard widget={widget} />
            </div>
          ))}
        </ResponsiveGridLayout>
      );
      break;
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return (
    <>
      {body}

      <WidgetModal />
    </>
  );
});

export const DashboardPageView = serverRenderedClient(DashboardPageViewContent);
