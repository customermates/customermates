"use client";

import type { CSSProperties } from "react";
import type { PublicDashboard } from "@/features/public-link/public-link.schema";
import type { PublicWidgetSelection } from "./public-widget-drawer";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { WIDGET_GRID_MARGIN, WIDGET_GRID_ROW_HEIGHT } from "@/features/widget/widget-grid";
import { RecordWidgetChart } from "@/app/[locale]/(protected)/w/[workspace]/dashboard/components/record-widget-chart";
import {
  isInteractiveTarget,
  isWidgetOpeningClick,
} from "@/app/[locale]/(protected)/w/[workspace]/dashboard/components/widget-interaction";

import { PublicLinkFrame } from "./public-link-frame";
import { PublicWidgetDrawer } from "./public-widget-drawer";

function placement(widget: PublicDashboard["widgets"][number], index: number): CSSProperties {
  const large = widget.layout?.lg;
  const rows = large?.h ?? 5;
  return {
    "--public-widget-height": `${rows * WIDGET_GRID_ROW_HEIGHT + (rows - 1) * WIDGET_GRID_MARGIN}px`,
    "--public-widget-column": large ? `${large.x + 1} / span ${large.w}` : "auto / span 6",
    "--public-widget-row": typeof large?.y === "number" ? `${large.y + 1} / span ${rows}` : `auto / span ${rows}`,
    order: index,
  } as CSSProperties;
}

export function PublicDashboardView({ dashboard, token }: { dashboard: PublicDashboard; token: string }) {
  const t = useTranslations();
  const [selection, setSelection] = useState<PublicWidgetSelection | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pointer = useRef<{ x: number; y: number; interactive: boolean } | null>(null);
  const inspect = (
    index: number,
    group: PublicWidgetSelection["group"],
    label: string | null,
    opener: HTMLElement | null,
  ) => {
    const widget = dashboard.widgets[index];
    if (!widget || widget.status !== "ready") return;
    setSelection({ widget: index, chart: widget, group, label, opener });
    setDrawerOpen(true);
  };

  return (
    <PublicLinkFrame
      after={
        selection ? (
          <PublicWidgetDrawer
            open={drawerOpen}
            selection={selection}
            token={token}
            onClose={() => setDrawerOpen(false)}
            onSelect={(group, label) => setSelection((current) => (current ? { ...current, group, label } : current))}
          />
        ) : null
      }
      expiresAt={dashboard.expiresAt}
      kind="dashboard"
      name={dashboard.name}
      workspaceName={dashboard.workspaceName}
    >
      {dashboard.widgets.length === 0 ? (
        <p className="text-sm text-muted-foreground" id="public-dashboard-empty">
          {t("PublicLink.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:[grid-auto-rows:54px]" id="public-dashboard-widgets">
          {dashboard.widgets.map((widget, index) => (
            <div
              key={widget.id}
              className="h-[var(--public-widget-height)] min-w-0 lg:h-auto lg:[grid-column:var(--public-widget-column)] lg:[grid-row:var(--public-widget-row)]"
              data-public-widget=""
              style={placement(widget, index)}
            >
              <div
                className="relative h-full cursor-pointer"
                onPointerDown={(event) => {
                  pointer.current =
                    event.button === 0
                      ? { x: event.clientX, y: event.clientY, interactive: isInteractiveTarget(event.target) }
                      : null;
                }}
                onPointerUp={(event) => {
                  const start = pointer.current;
                  pointer.current = null;
                  if (
                    start &&
                    isWidgetOpeningClick({
                      startX: start.x,
                      startY: start.y,
                      endX: event.clientX,
                      endY: event.clientY,
                      startedOnInteractive: start.interactive,
                    })
                  )
                    inspect(index, null, null, event.currentTarget.querySelector("button"));
                }}
              >
                <button
                  aria-label={t("RecordWidgets.dataTitle", { name: widget.name })}
                  className="pointer-events-none absolute inset-0 z-20 rounded-xl opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
                  data-public-widget-open=""
                  type="button"
                  onClick={(event) => inspect(index, null, null, event.currentTarget)}
                />

                <AppCard className="h-full overflow-visible">
                  <RecordWidgetChart
                    data={widget.data}
                    decimalPlaces={widget.decimalPlaces}
                    displayOptions={widget.displayOptions}
                    groupOptions={widget.groupOptions}
                    listLabels={widget.listLabels}
                    measure={widget.measure}
                    name={widget.name}
                    status={widget.status}
                    onInspectGroup={(group, label) =>
                      inspect(
                        index,
                        group,
                        label,
                        document.activeElement instanceof HTMLElement ? document.activeElement : null,
                      )
                    }
                  />
                </AppCard>
              </div>
            </div>
          ))}
        </div>
      )}

      {dashboard.hiddenWidgetCount > 0 ? (
        <p className="text-xs text-muted-foreground" id="public-dashboard-hidden">
          {t("PublicLink.hiddenWidgets", { count: dashboard.hiddenWidgetCount })}
        </p>
      ) : null}
    </PublicLinkFrame>
  );
}
