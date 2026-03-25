"use client";

import type { ComponentType } from "react";
import type { Layout, ResponsiveLayouts } from "react-grid-layout/legacy";
import type { ExtendedWidget } from "@/features/widget/widget.types";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterableField } from "@/core/base/base-get.schema";

import { useCallback, useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import dynamic from "next/dynamic";

import type { EntityType } from "@/generated/prisma";

import "@/styles/react-grid-layout.css";

import { WidgetCard } from "./widget-card";
import { WidgetAddCard } from "./widget-add-card";
import { WidgetModal } from "./widget-modal";
import { GRID_COLS, GRID_BREAKPOINTS } from "./grid.constants";

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
  widgets: ExtendedWidget[];
  customColumns: CustomColumnDto[];
  filterableFields: Record<EntityType, FilterableField[]>;
};

export const WidgetsGrid = observer(({ widgets, customColumns, filterableFields }: Props) => {
  const { widgetsStore, widgetModalStore } = useRootStore();
  const { items, layouts } = widgetsStore;
  const isTouchDevice = useIsTouchDevice();
  const pointerStart = useRef<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    widgetsStore.setItems({ items: widgets });
  }, [widgets]);

  useEffect(() => {
    function onPointerUp(e: PointerEvent) {
      if (!pointerStart.current) return;
      const { id, x, y } = pointerStart.current;
      pointerStart.current = null;
      if (Math.abs(e.clientX - x) < 8 && Math.abs(e.clientY - y) < 8) void widgetModalStore.loadById(id);
    }
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, []);

  const handlePointerDown = useCallback((id: string, e: React.PointerEvent) => {
    pointerStart.current = { id, x: e.clientX, y: e.clientY };
  }, []);

  return (
    <>
      {items.length > 0 && (
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

      <WidgetAddCard />

      <WidgetModal customColumns={customColumns} filterableFields={filterableFields} />
    </>
  );
});
