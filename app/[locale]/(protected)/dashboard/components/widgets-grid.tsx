"use client";

import type { ComponentType } from "react";
import type { Layout, Layouts } from "react-grid-layout";
import type { ExtendedWidget } from "@/features/widget/widget.types";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterableField } from "@/core/base/base-get.schema";

import { useEffect } from "react";
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
    import("react-grid-layout").then((mod) => {
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
  const { widgetsStore } = useRootStore();
  const { items, layouts } = widgetsStore;
  const isTouchDevice = useIsTouchDevice();

  useEffect(() => {
    widgetsStore.setItems({ items: widgets });
  }, [widgets]);

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
          onLayoutChange={(layout: Layout[], layouts: Layouts) => widgetsStore.onLayoutChange(layout, layouts)}
        >
          {items.map((widget) => (
            <div key={widget.id}>
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
