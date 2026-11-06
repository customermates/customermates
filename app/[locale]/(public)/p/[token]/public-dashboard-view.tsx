"use client";

import type { CSSProperties } from "react";
import type { PublicDashboard } from "@/features/public-link/public-link.schema";

import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { ErrorPageView } from "@/components/shared/error-page-view";
import { WIDGET_GRID_MARGIN, WIDGET_GRID_ROW_HEIGHT } from "@/features/widget/widget-grid";
import { RecordWidgetChart } from "@/app/[locale]/(protected)/w/[workspace]/dashboard/components/record-widget-chart";

const HOME_URL = "https://customermates.com";

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

export function PublicDashboardView({ dashboard }: { dashboard: PublicDashboard }) {
  const t = useTranslations();

  return (
    <div className="min-h-full w-full bg-background" id="public-dashboard">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-semibold" id="public-dashboard-title">
            {dashboard.name}
          </h1>

          <p className="text-sm text-muted-foreground">
            {dashboard.workspaceName
              ? t("PublicLink.byline", { workspace: dashboard.workspaceName })
              : t("PublicLink.bylineWithoutWorkspace")}
          </p>
        </header>

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
                <AppCard className="h-full overflow-visible">
                  <RecordWidgetChart
                    data={widget.data}
                    decimalPlaces={widget.decimalPlaces}
                    displayOptions={widget.displayOptions}
                    groupOptions={widget.groupOptions}
                    measure={widget.measure}
                    name={widget.name}
                    status={widget.status}
                  />
                </AppCard>
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
          <a className="hover:text-foreground" href={HOME_URL} id="public-dashboard-branding" rel="noopener">
            {t("PublicLink.branding")}
          </a>

          <span>
            {dashboard.expiresAt ? t("PublicLink.expires", { date: dashboard.expiresAt }) : t("PublicLink.live")}
          </span>
        </footer>
      </div>
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
