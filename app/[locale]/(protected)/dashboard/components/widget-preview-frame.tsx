"use client";

import type { ReactNode } from "react";

import { useLayoutEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { WidgetKind } from "@/generated/prisma";

import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";

import { DASHBOARD_GRID_MARGIN, DASHBOARD_ROW_HEIGHT, GRID_BREAKPOINTS, GRID_COLS } from "./grid.constants";
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
    if (grid && grid.clientWidth >= GRID_BREAKPOINTS.lg) setWidth(grid.clientWidth);
  }, []);
  return width;
}

type Props = {
  children: ReactNode;
  error?: ReactNode;
  fitContent?: boolean;
  geometry?: WidgetLayoutGeometry;
  interactive?: boolean;
  kind: WidgetKind;
  loading?: boolean;
};

const MAX_PREVIEW_SCALE = 1;
const MAX_PREVIEW_VIEWPORT_SHARE = 0.75;
const STAGE_RESET_CLASS =
  "[&_[data-slot=card-header]]:pr-6! [&_[data-slot=card-content]]:overflow-visible! [&_[data-uid=app-card]]:overflow-visible! [&_[data-uid=app-card]]:border! [&_[data-uid=app-card]]:bg-background! [&_[data-uid=app-card]]:shadow-xs!";

function useElementWidth() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width] as const;
}

export const WidgetPreviewFrame = observer(
  ({ children, error, fitContent = false, geometry: layout, interactive = false, kind, loading = false }: Props) => {
    const t = useTranslations();
    const [dashboardSize, setDashboardSize] = useState(false);
    const geometry = layout ?? widgetLayoutGeometry(kind, GRID_COLS.lg);
    const size = widgetPixelSize(useDashboardGridWidth(), geometry.w, geometry.h);
    const [measure, columnWidth] = useElementWidth();
    const scale = columnWidth
      ? Math.min(
          columnWidth / size.width,
          (window.innerHeight * MAX_PREVIEW_VIEWPORT_SHARE) / size.height,
          MAX_PREVIEW_SCALE,
        )
      : 1;

    return (
      <section aria-labelledby="widget-preview-heading" className="min-w-0" data-slot="widget-preview-frame">
        <div className="flex h-8 min-w-0 items-center gap-2">
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

          <Button
            aria-pressed={dashboardSize}
            className="ml-auto h-7 text-xs text-muted-foreground"
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setDashboardSize((value) => !value)}
          >
            {t("Dashboard.widgetEditor.preview.size", { w: geometry.w, h: geometry.h })}
          </Button>
        </div>

        <div ref={measure} className="w-full pt-2">
          <div
            className={cn(
              "relative mx-auto",
              !dashboardSize &&
                (fitContent
                  ? cn("max-h-80 overflow-auto", (loading || error) && "min-h-28")
                  : kind === "calendar" || kind === "map"
                    ? "h-80 sm:h-96"
                    : "h-64 sm:h-72"),
            )}
            data-preview-height={size.height}
            data-preview-sizing={dashboardSize ? "dashboard" : "content"}
            data-preview-width={size.width}
            data-slot="widget-preview"
            style={{
              width: dashboardSize ? size.width * scale : "100%",
              height: dashboardSize ? size.height * scale : undefined,
              visibility: dashboardSize && !columnWidth ? "hidden" : "visible",
            }}
          >
            <div
              className={cn(
                dashboardSize ? "absolute left-0 top-0 origin-top-left" : "h-full min-w-0",
                STAGE_RESET_CLASS,
              )}
              data-preview-interactive={interactive || undefined}
              inert={!interactive}
              style={
                dashboardSize ? { width: size.width, height: size.height, transform: `scale(${scale})` } : undefined
              }
            >
              {children}
            </div>

            {error && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background/90 p-6"
                data-preview-error=""
              >
                {error}
              </div>
            )}

            {loading && (
              <div className="absolute right-4 top-4" role="status">
                <Spinner aria-label={t("Loading.text")} className="size-4 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </section>
    );
  },
);
