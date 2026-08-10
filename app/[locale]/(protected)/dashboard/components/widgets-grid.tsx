"use client";

import type { ComponentType } from "react";
import type { Layout, ResponsiveLayouts } from "react-grid-layout/legacy";
import type { WidgetDto } from "@/features/widget/widget.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterableField } from "@/core/base/base-get.schema";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react-lite";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import type { EntityType } from "@/generated/prisma";

import "@/styles/react-grid-layout.css";

import { WidgetCard } from "./widget-card";
import { WidgetModal } from "./widget-modal";
import { GRID_COLS, GRID_BREAKPOINTS } from "./grid.constants";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { PageState } from "@/components/page-state/page-state";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useIsTouchDevice } from "@/core/utils/use-is-touch-device";

const ResponsiveGridLayout = dynamic(
  () =>
    import("react-grid-layout/legacy").then((mod) => {
      const { Responsive, WidthProvider } = mod;
      return WidthProvider(Responsive) as ComponentType<any>;
    }),
  { ssr: false },
);

type Props = {
  widgets: WidgetDto[];
  customColumns: CustomColumnDto[];
  filterableFields: Record<EntityType, FilterableField[]>;
};

export const WidgetsGrid = observer(({ widgets, customColumns, filterableFields }: Props) => {
  const t = useTranslations();
  const { widgetsStore, widgetModalStore } = useRootStore();
  const { items, layouts } = widgetsStore;
  const isTrueEmpty = widgetsStore.isReady && items.length === 0;
  const canAddWidget = widgetModalStore.availableEntityTypes.length > 0;
  const isTouchDevice = useIsTouchDevice();
  const pointerStart = useRef<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    widgetsStore.setItems({ items: widgets, customColumns });
  }, [widgets, customColumns]);

  useEffect(() => {
    if (typeof window === "undefined" || items.length === 0) return;
    const raf1 = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      const raf2 = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [items.length]);

  useEffect(() => {
    function onPointerUp(e: PointerEvent) {
      if (!pointerStart.current) return;
      const { id, x, y } = pointerStart.current;
      pointerStart.current = null;
      if (Math.abs(e.clientX - x) < 8 && Math.abs(e.clientY - y) < 8) {
        widgetModalStore.setExpandedSection("config");
        widgetModalStore.setExpandedFilterField(undefined);
        void widgetModalStore.loadById(id);
      }
    }
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, []);

  const handlePointerDown = useCallback((id: string, e: React.PointerEvent) => {
    pointerStart.current = { id, x: e.clientX, y: e.clientY };
  }, []);

  const topBarActions = useMemo(
    () =>
      widgetsStore.isReady && canAddWidget ? (
        <div className="flex items-center gap-1">
          <Button
            id="dashboard-add-widget"
            size="sm"
            variant={isTrueEmpty ? "secondary" : "default"}
            onClick={() => void widgetModalStore.add()}
          >
            <Icon icon={Plus} />

            <span className="hidden sm:inline">{t("Dashboard.addCard")}</span>
          </Button>
        </div>
      ) : null,
    [t, widgetModalStore, widgetsStore.isReady, canAddWidget, isTrueEmpty],
  );

  useSetTopBarActions(topBarActions);

  return (
    <>
      {!widgetsStore.isReady && (
        <PageState label={t("PageState.loading")} skeleton={{ kind: "dashboard" }} state="loading" />
      )}

      {widgetsStore.isReady && items.length > 0 && (
        <ResponsiveGridLayout
          isResizable
          breakpoints={GRID_BREAKPOINTS}
          className={isTouchDevice ? "layout touch-scrollable" : "layout"}
          cols={GRID_COLS}
          compactType="vertical"
          containerPadding={[0, 0]}
          isDraggable={!isTouchDevice}
          layouts={layouts}
          margin={[16, 16]}
          resizeHandles={["n", "s", "e", "w", "ne", "nw", "se", "sw"]}
          rowHeight={124}
          onLayoutChange={(layout: Layout, layouts: ResponsiveLayouts) => widgetsStore.onLayoutChange(layout, layouts)}
        >
          {items.map((widget) => (
            <div key={widget.id} onPointerDown={(e) => handlePointerDown(widget.id, e)}>
              <WidgetCard widget={widget} />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {isTrueEmpty && (
        <PageState
          action={
            canAddWidget ? (
              <Button size="sm" onClick={() => void widgetModalStore.add()}>
                {t("Dashboard.addCard")}
              </Button>
            ) : undefined
          }
          description={t("Common.emptyState.dashboardBody")}
          skeleton={{ kind: "dashboard" }}
          state="empty"
          title={t("Common.emptyState.dashboardTitle")}
        />
      )}

      <WidgetModal customColumns={customColumns} filterableFields={filterableFields} />
    </>
  );
});
