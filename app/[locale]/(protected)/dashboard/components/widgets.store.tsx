import type { Layout, LayoutItem, ResponsiveLayouts } from "react-grid-layout/legacy";
import type { SavedWidgetLayout, UpdateWidgetLayoutsData } from "@/features/widget/update-widget-layouts.interactor";
import type { WidgetDto } from "@/features/widget/widget.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, reaction, runInAction, toJS } from "mobx";

import { refreshWidgetsAction, updateWidgetLayoutsAction } from "../actions";

import { GRID_COLS } from "./grid.constants";
import { widgetLayoutGeometry } from "./widget-layout";
import { firstFreeSpot } from "@/features/widget/widget-grid";

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
  private layoutReceipts = new Map<string, SavedWidgetLayout>();
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
    const current = new Map(this.items.map((widget) => [widget.id, widget]));
    if (this.collectionActor !== this.layoutActor) this.layoutReceipts.clear();
    super.setItems({
      ...args,
      items: args.items.map((widget) => {
        const known = current.get(widget.id);
        if (this.collectionActor === this.layoutActor && known && known.version > widget.version) return known;
        const receipt = this.layoutReceipts.get(widget.id);
        if (receipt && receipt.version > widget.version) return { ...widget, layout: receipt.layout };
        this.layoutReceipts.delete(widget.id);
        return widget;
      }),
    });
    this.rebuildLayouts();
  }

  private rebuildLayouts() {
    const ids = new Set(this.items.map((widget) => widget.id));
    for (const id of this.layoutReceipts.keys()) if (!ids.has(id)) this.layoutReceipts.delete(id);
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
          const spot = firstFreeSpot(layouts[breakpoint], cols, w, h);
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
        const confirmed = this.normalizeLayouts(this.confirmedLayouts);
        const ids = new Set(
          pending.payload.lg.concat(pending.payload.md, pending.payload.sm, pending.payload.xs).map((item) => item.i),
        );
        const changed = new Set(
          [...ids].filter((id) =>
            BREAKPOINTS.some(
              (breakpoint) =>
                JSON.stringify(confirmed[breakpoint].find((item) => item.i === id)) !==
                JSON.stringify(pending.payload[breakpoint].find((item) => item.i === id)),
            ),
          ),
        );
        if (changed.size === 0) continue;
        const layouts = Object.fromEntries(
          BREAKPOINTS.map((breakpoint) => [
            breakpoint,
            pending.payload[breakpoint].filter((item) => changed.has(item.i)),
          ]),
        ) as UpdateWidgetLayoutsData["layouts"];
        const result = await updateWidgetLayoutsAction({ layouts });
        if (!ownsActor()) continue;
        if (result.ok) {
          const saved = new Map(result.data.map((widget) => [widget.id, widget]));
          const savedLayouts: ResponsiveLayouts = Object.fromEntries(
            BREAKPOINTS.map((breakpoint) => [
              breakpoint,
              this.items.flatMap((widget) => {
                const committed = saved.get(widget.id);
                const item =
                  committed && committed.version >= widget.version
                    ? committed.layout[breakpoint]
                    : widget.layout?.[breakpoint];
                return item ? [{ ...item, y: item.y ?? 0 }] : [];
              }),
            ]),
          );
          this.confirmedLayouts = this.rebaseLayouts(this.confirmedLayouts, savedLayouts);
          runInAction(() => {
            for (const widget of this.items) {
              const committed = saved.get(widget.id);
              if (committed && committed.version >= widget.version) {
                this.layoutReceipts.set(widget.id, committed);
                if (committed.version <= widget.version + 1) widget.version = committed.version;
                widget.layout = committed.layout;
              }
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
}
