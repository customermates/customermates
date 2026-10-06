"use client";

import type { ReactNode } from "react";

import { useLayoutEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import type { WidgetKind } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/core/utils/cn";

import { DASHBOARD_GRID_MARGIN, DASHBOARD_ROW_HEIGHT, GRID_COLS } from "./grid.constants";
import { type WidgetLayoutGeometry, widgetLayoutGeometry } from "@/features/widget/widget-grid";

const FALLBACK_GRID_WIDTH = 1120;

export function widgetPixelSize(gridWidth: number, w: number, h: number) {
  const cols = GRID_COLS.lg;
  const column = (gridWidth - DASHBOARD_GRID_MARGIN * (cols - 1)) / cols;
  return {
    width: Math.round(column * w + DASHBOARD_GRID_MARGIN * (w - 1)),
    height: DASHBOARD_ROW_HEIGHT * h + DASHBOARD_GRID_MARGIN * (h - 1),
  };
}

function useDashboardGridWidth() {
  const [width, setWidth] = useState(FALLBACK_GRID_WIDTH);
  useLayoutEffect(() => {
    const grid = document.querySelector<HTMLElement>(".react-grid-layout");
    if (grid?.clientWidth) setWidth(grid.clientWidth);
  }, []);
  return width;
}

type Props = {
  children: ReactNode;
  geometry?: WidgetLayoutGeometry;
  kind: WidgetKind;
  loading?: boolean;
  refreshDisabled?: boolean;
  refreshLabel: string;
  onRefresh: () => void;
};

export const WidgetPreviewFrame = observer(
  ({ children, geometry: layout, kind, loading = false, refreshDisabled, refreshLabel, onRefresh }: Props) => {
    const t = useTranslations();
    const geometry = layout ?? widgetLayoutGeometry(kind, GRID_COLS.lg);
    const size = widgetPixelSize(useDashboardGridWidth(), geometry.w, geometry.h);

    return (
      <section aria-labelledby="widget-preview-heading" className="min-w-0 space-y-3" data-slot="widget-preview-frame">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <h3 className="flex items-center gap-2 text-sm font-medium" id="widget-preview-heading">
              <span aria-hidden className="relative flex size-2">
                <span
                  className={cn(
                    "absolute inline-flex size-full rounded-full bg-success opacity-60",
                    loading && "animate-ping motion-reduce:animate-none",
                  )}
                />

                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>

              {t("Dashboard.widgetEditor.preview.live")}
            </h3>

            <p className="text-xs text-muted-foreground">
              {t("Dashboard.widgetEditor.preview.size", { w: geometry.w, h: geometry.h })}
            </p>
          </div>

          <Button
            aria-label={refreshLabel}
            disabled={refreshDisabled || loading}
            size="icon"
            title={refreshLabel}
            type="button"
            variant="ghost"
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden className={cn("size-4", loading && "animate-spin motion-reduce:animate-none")} />
          </Button>
        </div>

        <div
          inert
          className="relative mx-auto max-w-full"
          data-slot="widget-preview"
          style={{ width: size.width, height: size.height }}
        >
          {children}

          {loading && (
            <div className="absolute right-4 top-4" role="status">
              <Spinner aria-label={t("Loading.text")} className="size-4 text-muted-foreground" />
            </div>
          )}
        </div>
      </section>
    );
  },
);
