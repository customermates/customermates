"use client";

import type { ComponentType, ReactNode } from "react";
import type { Layout, ResponsiveLayouts } from "react-grid-layout/legacy";
import type { FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { WidgetDto } from "@/features/widget/widget.schema";
import type { EntityType } from "@/generated/prisma";

import dynamic from "next/dynamic";
import { BarChart3, Plus } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";

import "@/styles/react-grid-layout.css";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { PageState } from "@/components/page-state/page-state";
import { resolveResourcePageState } from "@/components/page-state/resource-page-state";
import { Icon } from "@/components/shared/icon";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useIsTouchDevice } from "@/core/utils/use-is-touch-device";

import { DashboardPageSkeleton } from "./dashboard-page-skeleton";
import { GRID_BREAKPOINTS, GRID_COLS } from "./grid.constants";
import { WidgetCard } from "./widget-card";
import { WidgetModal } from "./widget-modal";

const ResponsiveGridLayout = dynamic(
  () =>
    import("react-grid-layout/legacy").then(
      ({ Responsive, WidthProvider }) => WidthProvider(Responsive) as ComponentType<any>,
    ),
  { ssr: false },
);

type Props = {
  customColumns: CustomColumnDto[];
  filterableFields: Record<EntityType, FilterableField[]>;
  widgets: WidgetDto[];
};

export const DashboardPageView = observer(function DashboardPageView({
  customColumns,
  filterableFields,
  widgets,
}: Props) {
  const { widgetModalStore, widgetsStore } = useRootStore();
  const { items, layouts } = widgetsStore;
  const canAddWidget = widgetModalStore.availableEntityTypes.length > 0;
  const isTouchDevice = useIsTouchDevice();
  const pointerStart = useRef<{ id: string; x: number; y: number } | null>(null);
  const t = useTranslations();

  useLayoutEffect(
    () => widgetsStore.setItems({ items: widgets, customColumns }),
    [customColumns, widgets, widgetsStore],
  );

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
      const { id, x, y } = pointerStart.current;
      pointerStart.current = null;
      if (Math.abs(event.clientX - x) < 8 && Math.abs(event.clientY - y) < 8) {
        widgetModalStore.setExpandedSection("config");
        widgetModalStore.setExpandedFilterField(undefined);
        void widgetModalStore.loadById(id);
      }
    }
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, [widgetModalStore]);

  const handlePointerDown = useCallback((id: string, event: React.PointerEvent) => {
    pointerStart.current = { id, x: event.clientX, y: event.clientY };
  }, []);
  const pageState = resolveResourcePageState(widgetsStore.dataRequest, items.length);
  const topBarActions = useMemo(
    () =>
      pageState !== "loading" && pageState !== "error" && canAddWidget ? (
        <div className="flex items-center gap-1">
          <Button id="dashboard-add-widget" size="sm" variant="default" onClick={() => void widgetModalStore.add()}>
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
            <Button size="sm" variant="outline" onClick={() => void widgetsStore.refreshQuery().catch(() => undefined)}>
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
            canAddWidget ? (
              <Button size="sm" variant="secondary" onClick={() => void widgetModalStore.add()}>
                {t("Dashboard.addCard")}
              </Button>
            ) : undefined
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
          isDraggable={!isTouchDevice}
          layouts={layouts}
          margin={[16, 16]}
          resizeHandles={["n", "s", "e", "w", "ne", "nw", "se", "sw"]}
          rowHeight={124}
          onLayoutChange={(layout: Layout, nextLayouts: ResponsiveLayouts) =>
            widgetsStore.onLayoutChange(layout, nextLayouts)
          }
        >
          {items.map((widget) => (
            <div key={widget.id} onPointerDown={(event) => handlePointerDown(widget.id, event)}>
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

      <WidgetModal customColumns={customColumns} filterableFields={filterableFields} />
    </>
  );
});
