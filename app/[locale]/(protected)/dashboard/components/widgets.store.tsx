import type { Layout, LayoutItem, ResponsiveLayouts } from "react-grid-layout/legacy";
import type { UpdateWidgetLayoutsData } from "@/features/widget/update-widget-layouts.interactor";
import type { WidgetDto } from "@/features/widget/widget.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, reaction, runInAction, toJS } from "mobx";

import { refreshWidgetsAction, updateWidgetLayoutsAction } from "../actions";

import { GRID_COLS } from "./grid.constants";
import { widgetLayoutGeometry } from "./widget-layout";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { BREAKPOINTS } from "@/constants/breakpoints";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { reportApplicationError } from "@/core/errors/report-application-error";

type MutableLayouts = Record<string, LayoutItem[]>;

export class WidgetsStore extends BaseDataViewStore<WidgetDto> {
  layouts: ResponsiveLayouts = { xs: [], sm: [], md: [], lg: [] };
  private confirmedLayouts: ResponsiveLayouts = this.layouts;
  private layoutItems: WidgetDto[] | null = null;
  private collectionActor: string | null = null;
  private pendingLayout: {
    layouts: ResponsiveLayouts;
    payload: UpdateWidgetLayoutsData["layouts"];
    actor: string | null;
  } | null = null;
  private layoutWrite: Promise<void> | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      layouts: observable,
      onLayoutChange: action,
    });
    reaction(
      () => this.items,
      () => {
        if (this.layoutItems !== this.items) runInAction(() => this.rebuildLayouts());
      },
    );
  }

  get columnsDefinition() {
    return [];
  }

  setItems(args: GetResult<WidgetDto>) {
    super.setItems({
      ...args,
      customColumns: args.customColumns ?? this.customColumns,
    });
    this.rebuildLayouts();
  }

  private rebuildLayouts() {
    const layouts: MutableLayouts = { xs: [], sm: [], md: [], lg: [] };

    this.items.forEach((widget) => {
      for (const breakpoint of BREAKPOINTS) {
        const layoutItem = widget.layout?.[breakpoint];
        const cols = GRID_COLS[breakpoint];
        const geometry = widgetLayoutGeometry(widget.kind, cols, layoutItem);
        const { w, h } = geometry;

        let x = layoutItem?.x;
        let y = layoutItem?.y;

        if (x == null || y == null) {
          const spot = this.findFirstAvailableSpot(layouts[breakpoint], cols, w, h);
          x ??= spot.x;
          y ??= spot.y;
        }

        x = Math.min(x, Math.max(0, cols - w));
        layouts[breakpoint].push({ x, y, i: widget.id, ...geometry });
      }
    });

    const ownsPending = this.layoutWrite !== null && this.collectionActor === this.layoutActor;
    this.layouts = ownsPending ? this.rebaseLayouts(layouts, this.layouts) : layouts;
    this.confirmedLayouts = ownsPending ? this.rebaseLayouts(layouts, this.confirmedLayouts) : layouts;
    if (ownsPending && this.pendingLayout) {
      const pendingLayouts = this.rebaseLayouts(layouts, this.pendingLayout.layouts);
      this.pendingLayout = {
        ...this.pendingLayout,
        layouts: pendingLayouts,
        payload: this.normalizeLayouts(pendingLayouts),
      };
    } else if (!ownsPending) this.pendingLayout = null;
    this.collectionActor = this.layoutActor;
    this.layoutItems = this.items;
  }

  onLayoutChange(_: Layout, layouts: ResponsiveLayouts) {
    if (!this.isReady) return;

    const payloadNew = this.normalizeLayouts(layouts);
    const payloadCurrent = this.normalizeLayouts(this.layouts);

    if (JSON.stringify(payloadNew) === JSON.stringify(payloadCurrent)) return;

    const snapshot: ResponsiveLayouts = Object.fromEntries(
      BREAKPOINTS.map((breakpoint) => [breakpoint, toJS(layouts[breakpoint] ?? []).map((item) => ({ ...item }))]),
    );
    this.layouts = snapshot;
    this.pendingLayout = {
      layouts: snapshot,
      payload: payloadNew,
      actor: this.layoutActor,
    };
    this.startLayoutWrite();
  }

  private startLayoutWrite() {
    if (this.layoutWrite) return;
    this.layoutWrite = this.rootStore.loadingOverlayStore
      .withLoading(() => this.saveLayouts())
      .finally(() => {
        this.layoutWrite = null;
        if (this.pendingLayout) this.startLayoutWrite();
      });
    void this.layoutWrite.catch(reportApplicationError);
  }

  private get layoutActor() {
    const user = this.rootStore.userStore?.user;
    return user ? `${user.companyId}:${user.id}` : null;
  }

  private async saveLayouts() {
    while (this.pendingLayout) {
      const pending = this.pendingLayout;
      this.pendingLayout = null;
      const ownsActor = () => pending.actor === this.layoutActor && pending.actor === this.collectionActor;
      if (!ownsActor()) continue;
      try {
        const result = await updateWidgetLayoutsAction({ layouts: pending.payload });
        if (!ownsActor()) continue;
        if (result.ok) {
          this.confirmedLayouts = this.rebaseLayouts(this.confirmedLayouts, pending.layouts);
          const confirmed = this.normalizeLayouts(this.confirmedLayouts);
          runInAction(() => {
            for (const widget of this.items) {
              widget.layout = Object.fromEntries(
                BREAKPOINTS.map((breakpoint) => [
                  breakpoint,
                  confirmed[breakpoint].find((item) => item.i === widget.id),
                ]),
              );
            }
          });
        } else {
          if (!this.pendingLayout) this.restoreLayouts(this.confirmedLayouts);
          if (this.hasCurrentWidgets(pending.layouts)) toastZodErrorTree(result.error);
        }
      } catch (error) {
        if (!ownsActor()) continue;
        if (!this.pendingLayout) this.restoreLayouts(this.confirmedLayouts);
        if (this.hasCurrentWidgets(pending.layouts)) reportApplicationError(error);
      }
    }
  }

  private hasCurrentWidgets(layouts: ResponsiveLayouts) {
    const ids = new Set(this.items.map((widget) => widget.id));
    return BREAKPOINTS.some((breakpoint) => (layouts[breakpoint] ?? []).some((item) => ids.has(item.i)));
  }

  private rebaseLayouts(base: ResponsiveLayouts, desired: ResponsiveLayouts): ResponsiveLayouts {
    const widgets = new Map(this.items.map((widget) => [widget.id, widget]));
    return Object.fromEntries(
      BREAKPOINTS.map((breakpoint) => {
        const overrides = new Map((desired[breakpoint] ?? []).map((item) => [item.i, item]));
        const cols = GRID_COLS[breakpoint];
        return [
          breakpoint,
          (base[breakpoint] ?? []).flatMap((item) => {
            const widget = widgets.get(item.i);
            if (!widget) return [];
            const preferred = overrides.get(item.i) ?? item;
            const geometry = widgetLayoutGeometry(widget.kind, cols, preferred);
            return [
              { i: item.i, x: Math.min(preferred.x, Math.max(0, cols - geometry.w)), y: preferred.y, ...geometry },
            ];
          }),
        ];
      }),
    );
  }

  private restoreLayouts(layouts: ResponsiveLayouts) {
    runInAction(() => {
      this.layouts = layouts;
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
