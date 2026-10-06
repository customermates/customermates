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
import { type WidgetLayoutGeometry, widgetLayoutGeometry } from "./widget-layout";

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
  error?: string | null;
  geometry?: WidgetLayoutGeometry;
  kind: WidgetKind;
  loading: boolean;
  name: string;
  refreshDisabled?: boolean;
  refreshLabel: string;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  onRefresh: () => void;
};

export const WidgetPreviewFrame = observer(
  ({
    children,
    error,
    geometry: layout,
    kind,
    loading,
    name,
    refreshDisabled,
    refreshLabel,
    subtitle,
    toolbar,
    onRefresh,
  }: Props) => {
    const t = useTranslations();
    const geometry = layout ?? widgetLayoutGeometry(kind, GRID_COLS.lg);
    const size = widgetPixelSize(useDashboardGridWidth(), geometry.w, geometry.h);
    const title = name.trim() || t("Dashboard.widgetEditor.preview.untitled");

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

          <div className="flex shrink-0 items-center gap-1">
            {toolbar}

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
        </div>

        <div
          className="relative mx-auto flex max-w-full flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xs"
          data-slot="widget-preview"
          style={{ width: size.width, height: size.height }}
        >
          <div className="flex shrink-0 flex-col gap-0.5 px-6 pt-6">
            <p className="text-x-md w-full truncate">{title}</p>

            {subtitle}
          </div>

          <div inert className="flex min-h-0 flex-1 flex-col p-6 recharts-no-focus-outline">
            {error ? (
              <p className="m-auto text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : (
              children
            )}
          </div>

          {loading && (
            <div className="absolute right-3 top-3" role="status">
              <Spinner aria-label={t("Loading.text")} className="size-4 text-muted-foreground" />
            </div>
          )}
        </div>
      </section>
    );
  },
);
