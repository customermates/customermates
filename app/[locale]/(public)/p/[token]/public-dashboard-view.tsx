"use client";

import type { CSSProperties } from "react";
import type { PublicDashboard } from "@/features/public-link/public-link.schema";
import type { PublicWidgetSelection } from "./public-widget-drawer";

import Image from "next/image";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { ErrorPageView } from "@/components/shared/error-page-view";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { WIDGET_GRID_MARGIN, WIDGET_GRID_ROW_HEIGHT } from "@/features/widget/widget-grid";
import { RecordWidgetChart } from "@/app/[locale]/(protected)/w/[workspace]/dashboard/components/record-widget-chart";
import {
  isInteractiveTarget,
  isWidgetOpeningClick,
} from "@/app/[locale]/(protected)/w/[workspace]/dashboard/components/widget-interaction";

import { PublicWidgetDrawer } from "./public-widget-drawer";

const HOME_URL = "https://customermates.com";
const UTM = "utm_source=public_dashboard&utm_medium=referral&utm_campaign=public_link";

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

function Logo({ className }: { className: string }) {
  return (
    <>
      <Image
        alt=""
        className={cn(className, "dark:hidden")}
        height={16}
        src="/images/light/customermates-square.svg"
        width={16}
      />

      <Image
        alt=""
        className={cn(className, "hidden dark:block")}
        height={16}
        src="/images/dark/customermates-square.svg"
        width={16}
      />
    </>
  );
}

export function PublicDashboardView({ dashboard, token }: { dashboard: PublicDashboard; token: string }) {
  const t = useTranslations();
  const { appMode } = useRootStore();
  const upsell = appMode === "cloud";
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
    setSelection({ widget: index, widgetName: widget.name, group, label, opener });
    setDrawerOpen(true);
  };

  return (
    <div className="min-h-full w-full bg-background" id="public-dashboard">
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 md:px-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight" id="public-dashboard-title">
              {dashboard.name}
            </h1>

            <p className="text-sm text-muted-foreground">
              {dashboard.workspaceName
                ? t("PublicLink.byline", { workspace: dashboard.workspaceName })
                : t("PublicLink.bylineWithoutWorkspace")}
            </p>
          </div>

          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" id="public-dashboard-live">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />

            {dashboard.expiresAt ? t("PublicLink.expires", { date: dashboard.expiresAt }) : t("PublicLink.live")}
          </span>
        </div>

        {dashboard.widgets.length === 0 ? (
          <p className="text-sm text-muted-foreground" id="public-dashboard-empty">
            {t("PublicLink.empty")}
          </p>
        ) : (
          <div
            className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:[grid-auto-rows:54px]"
            id="public-dashboard-widgets"
          >
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

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>{t("PublicLink.readOnly")}</span>

          <a
            className="hover:text-foreground"
            href={upsell ? `${HOME_URL}/?${UTM}&utm_content=footer` : HOME_URL}
            id="public-dashboard-branding"
            rel="noopener"
          >
            {t("PublicLink.branding")}
          </a>
        </footer>

        {upsell ? (
          <div className="pointer-events-none sticky bottom-4 z-30 flex justify-end">
            <a
              className="group pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground"
              href={`/auth/signup?${UTM}&utm_content=badge`}
              id="public-dashboard-badge"
            >
              <Logo className="size-4 rounded" />

              <span>{t("PublicLink.upsell.badge")}</span>

              <span className="hidden text-primary-soft-foreground group-hover:inline group-focus-visible:inline">
                {t("PublicLink.upsell.badgeHover")}
              </span>
            </a>
          </div>
        ) : null}
      </main>

      {selection ? (
        <PublicWidgetDrawer
          open={drawerOpen}
          selection={selection}
          token={token}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function PublicLinkUnavailable({ rateLimited }: { rateLimited: boolean }) {
  const t = useTranslations();
  return (
    <ErrorPageView
      backHref={HOME_URL}
      backLabel={t("PublicLink.toHome")}
      body={rateLimited ? t("PublicLink.rateLimitedBody") : t("PublicLink.unavailableBody")}
      subtitle={rateLimited ? t("PublicLink.rateLimitedSubtitle") : t("PublicLink.unavailableSubtitle")}
      title={rateLimited ? t("PublicLink.rateLimitedTitle") : t("PublicLink.unavailableTitle")}
    />
  );
}
