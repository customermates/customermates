import type { Layout, LayoutItem, ResponsiveLayouts } from "react-grid-layout/legacy";
import type { UpdateWidgetLayoutsData } from "@/features/widget/update-widget-layouts.interactor";
import type { ExtendedWidget } from "@/features/widget/widget.types";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable } from "mobx";

import { refreshWidgetsAction, updateWidgetLayoutsAction } from "../actions";

import { GRID_COLS } from "./grid.constants";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { BREAKPOINTS } from "@/constants/breakpoints";

type MutableLayouts = Record<string, LayoutItem[]>;

export class WidgetsStore extends BaseDataViewStore<ExtendedWidget> {
  layouts: ResponsiveLayouts = { xs: [], sm: [], md: [], lg: [] };

  constructor(public readonly rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      layouts: observable,
      onLayoutChange: action,
    });
  }

  get columnsDefinition() {
    return [];
  }

  setItems(args: GetResult<ExtendedWidget>) {
    this.items = args.items;
    this.customColumns = args.customColumns ?? [];

    const layouts: MutableLayouts = { xs: [], sm: [], md: [], lg: [] };

    this.items.forEach((widget) => {
      for (const breakpoint of BREAKPOINTS) {
        const layoutItem = widget.layout?.[breakpoint];
        const cols = GRID_COLS[breakpoint];
        const w = Math.min(layoutItem?.w ?? 4, cols);
        const h = layoutItem?.h ?? 4;

        let x = layoutItem?.x;
        let y = layoutItem?.y;

        if (x == null || y == null) {
          const spot = this.findFirstAvailableSpot(layouts[breakpoint], cols, w, h);
          x ??= spot.x;
          y ??= spot.y;
        }

        layouts[breakpoint].push({ x, y, w, h, i: widget.id });
      }
    });

    this.layouts = layouts;
    this.isReady = true;
  }

  onLayoutChange(_: Layout, layouts: ResponsiveLayouts) {
    if (!this.isReady) return;

    const payloadNew = this.normalizeLayouts(layouts);
    const payloadCurrent = this.normalizeLayouts(this.layouts);

    if (JSON.stringify(payloadNew) === JSON.stringify(payloadCurrent)) return;

    this.layouts = layouts;

    void this.rootStore.loadingOverlayStore.withLoading(async () => {
      await updateWidgetLayoutsAction({ layouts: payloadNew });
    });
  }

  protected async refreshAction() {
    const widgets = await refreshWidgetsAction();
    return { items: widgets };
  }

  private normalizeLayouts(layouts: ResponsiveLayouts): UpdateWidgetLayoutsData["layouts"] {
    const payload: UpdateWidgetLayoutsData["layouts"] = { xs: [], sm: [], md: [], lg: [] };

    BREAKPOINTS.forEach((breakpoint) => {
      payload[breakpoint] = (layouts[breakpoint] ?? []).map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    });

    return payload;
  }

  private findFirstAvailableSpot(
    layout: LayoutItem[],
    cols: number,
    itemW: number,
    itemH: number,
  ): { x: number; y: number } {
    const occupied: Record<number, Array<[number, number]>> = {};
    layout.forEach((item) => {
      for (let y = item.y; y < item.y + item.h; y++) (occupied[y] ??= []).push([item.x, item.x + item.w]);
    });

    const maxX = Math.max(0, cols - itemW);
    if (maxX < 0) return { x: 0, y: 0 };

    for (let y = 0; ; y++) {
      for (let x = 0; x <= maxX; x++) {
        const fits = Array.from({ length: itemH }, (_, i) => y + i).every((yy) => {
          const row = occupied[yy] || [];
          return row.every(([sx, ex]) => ex <= x || sx >= x + itemW);
        });

        if (fits) return { x, y };
      }
    }
  }
}
