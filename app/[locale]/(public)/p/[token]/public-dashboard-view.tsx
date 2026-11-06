"use client";

import type { CSSProperties } from "react";
import type { PublicDashboard } from "@/features/public-link/public-link.schema";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
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

const SIGNUP_QUERY = "utm_source=public_dashboard&utm_medium=referral&utm_campaign=public_link";

function Logo({ className }: { className: string }) {
  return (
    <>
      <Image
        alt=""
        className={cn(className, "dark:hidden")}
        height={24}
        src="/images/light/customermates-square.svg"
        width={24}
      />

      <Image
        alt=""
        className={cn(className, "hidden dark:block")}
        height={24}
        src="/images/dark/customermates-square.svg"
        width={24}
      />
    </>
  );
}

export function PublicDashboardView({ dashboard }: { dashboard: PublicDashboard }) {
  const t = useTranslations();
  const { appMode } = useRootStore();
  const upsell = appMode === "cloud";
  const signup = `/auth/signup?${SIGNUP_QUERY}&utm_content=`;

  return (
    <div className="min-h-full w-full bg-background" id="public-dashboard">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-3 px-4 md:px-8">
          <a
            aria-label={t("PublicLink.toHome")}
            className="flex min-w-0 items-center gap-2 text-sm font-semibold"
            href={upsell ? `${HOME_URL}/?${SIGNUP_QUERY}&utm_content=header` : HOME_URL}
            id="public-dashboard-logo"
            rel="noopener"
          >
            <Logo className="size-6 shrink-0 rounded-md" />

            <Image
              alt=""
              className="h-4 w-auto dark:hidden"
              height={23}
              src="/images/light/customermates.svg"
              width={229}
            />

            <Image
              alt=""
              className="hidden h-4 w-auto dark:block"
              height={23}
              src="/images/dark/customermates.svg"
              width={229}
            />
          </a>

          {upsell ? (
            <Button asChild id="public-dashboard-cta-header" size="sm">
              <a href={`${signup}header`}>{t("PublicLink.upsell.headerCta")}</a>
            </Button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
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

        {upsell ? (
          <section
            aria-labelledby="public-dashboard-upsell-title"
            className="mt-4 overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-6 md:p-8"
            id="public-dashboard-upsell"
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex max-w-2xl flex-col gap-2">
                <span className="flex items-center gap-2 text-xs font-medium text-primary-soft-foreground">
                  <Logo className="size-5 rounded" />

                  {t("PublicLink.upsell.eyebrow")}
                </span>

                <h2 className="text-xl font-semibold tracking-tight md:text-2xl" id="public-dashboard-upsell-title">
                  {t("PublicLink.upsell.title")}
                </h2>

                <p className="text-sm text-muted-foreground md:text-base">{t("PublicLink.upsell.body")}</p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild id="public-dashboard-cta" size="lg">
                  <a href={`${signup}banner`}>{t("PublicLink.upsell.primary")}</a>
                </Button>

                <Button asChild id="public-dashboard-learn-more" size="lg" variant="secondary">
                  <a href={`${HOME_URL}/?${SIGNUP_QUERY}&utm_content=banner`} rel="noopener">
                    {t("PublicLink.upsell.secondary")}
                  </a>
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <a
            className="hover:text-foreground"
            href={upsell ? `${HOME_URL}/?${SIGNUP_QUERY}&utm_content=footer` : HOME_URL}
            id="public-dashboard-branding"
            rel="noopener"
          >
            {t("PublicLink.branding")}
          </a>

          <span>{t("PublicLink.readOnly")}</span>
        </footer>

        {upsell ? (
          <div className="pointer-events-none sticky bottom-4 z-30 flex justify-end">
            <a
              className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition-colors hover:border-primary/50"
              href={`${signup}badge`}
              id="public-dashboard-badge"
            >
              <Logo className="size-4 rounded" />

              {t("PublicLink.upsell.badge")}
            </a>
          </div>
        ) : null}
      </main>
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
