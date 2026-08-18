"use client";

import type { ActivityWidgetDto } from "@/features/widget/widget.schema";

import type { ReactNode } from "react";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { Icon } from "@/components/shared/icon";
import { PageState } from "@/components/page-state/page-state";
import { ActivitiesList, TimelineNotice } from "@/features/messaging/activities/activities-list";
import { ActivityTimelineSkeleton } from "@/features/messaging/activities/activity-timeline-skeleton";
import { ActivityQueryProvider } from "@/features/messaging/activities/activity-query-context";
import { useOwnedActivitiesStore } from "@/features/messaging/activities/use-owned-activities-store";
import { useRootStore } from "@/core/stores/root-store.provider";

import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";
import { ActivityWidgetFilters } from "./activity-widget-filters";
import {
  accountSupportsActivitySources,
  activityWidgetSourcePlan,
  resolveActivityWidgetState,
} from "./activity-widget-state";

type Props = {
  widget: ActivityWidgetDto;
};

export const ActivityWidgetCard = observer(({ widget }: Props) => {
  const t = useTranslations();
  const { connectedAccountsStore } = useRootStore();
  const store = useOwnedActivitiesStore({});
  const sourcePlan = activityWidgetSourcePlan(widget.timelineFilters, store.availableSources);
  const needsConnectedAccount = sourcePlan.connectedAccountSources.length > 0;

  useEffect(() => {
    void store.applyFilters(widget.timelineFilters).catch(() => undefined);
  }, [store, widget.timelineFilters]);

  useEffect(() => {
    if (!needsConnectedAccount) return;

    void connectedAccountsStore.ensureLoaded().catch(() => undefined);
  }, [connectedAccountsStore, needsConnectedAccount]);

  const showFilters = widget.displayOptions?.showFilters !== false;
  const connectedAccountCount = connectedAccountsStore.items.filter((account) =>
    accountSupportsActivitySources(account, sourcePlan.connectedAccountSources),
  ).length;
  const accountsReady = !needsConnectedAccount || connectedAccountsStore.isReady;
  const constrained = widget.timelineFilters.length > 0;
  const state = resolveActivityWidgetState({
    accountsError: connectedAccountsStore.dataRequest.status === "refresh-error",
    accountsReady,
    availableRequestedSources: sourcePlan.availableRequestedSources,
    constrained,
    connectedAccountCount,
    filtering: store.isRefreshing,
    itemCount: store.items.length,
    loadError: store.dataRequest.status === "refresh-error",
    ready: store.isReady,
    requestedSources: sourcePlan.requestedSources,
    scopeTruncated: store.scopeTruncated,
  });
  const notices = (
    <>
      {store.scopeTruncated && <TimelineNotice label={t("Dashboard.activityWidget.scopeTooBroad")} />}

      {store.olderPageError && store.items.length > 0 && (
        <TimelineNotice label={t("Dashboard.activityWidget.loadOlderError")} />
      )}

      {store.pageLimitReached && <TimelineNotice label={t("Dashboard.activityWidget.pageLimitReached")} />}
    </>
  );
  const withBodyPadding = (children: ReactNode) => <div className="px-4 pb-4 pt-2">{children}</div>;
  const withNotices = (children: ReactNode) =>
    withBodyPadding(
      <>
        {notices}

        {children}
      </>,
    );

  let body: ReactNode;
  switch (state) {
    case "noPermission":
      body = <EmptyState label={t("Dashboard.activityWidget.noPermission")} />;
      break;
    case "loading":
      body = withBodyPadding(
        <PageState
          background={<ActivityTimelineSkeleton />}
          className="min-h-40"
          label={t("PageState.loading")}
          state="loading"
        />,
      );
      break;
    case "error":
      body = <EmptyState label={t("Dashboard.activityWidget.error")} />;
      break;
    case "noAccount":
      body = <EmptyState label={t("Dashboard.activityWidget.noAccount")} />;
      break;
    case "scopeTooBroad":
      body = <EmptyState label={t("Dashboard.activityWidget.scopeTooBroad")} />;
      break;
    case "noActivity":
      body = withNotices(
        <PageState
          background={<ActivityTimelineSkeleton animated={false} rows={4} />}
          className="min-h-40"
          description={t("Dashboard.activityWidget.noActivity")}
          icon={Clock}
          state="empty"
          title={widget.name}
        />,
      );
      break;
    case "noMatches":
      body = withNotices(<EmptyState label={t("Dashboard.activityWidget.noMatches")} />);
      break;
    case "content":
      body = withNotices(
        <ActivitiesList
          customColumns={store.customColumns}
          hasMore={store.hasMore}
          items={store.items}
          loading={store.loading}
          onLoadOlder={() => void store.loadOlder()}
        />,
      );
      break;
    default: {
      const exhaustive: never = state;
      body = exhaustive;
    }
  }

  return (
    <ActivityQueryProvider filters={store.filters} scope={store.scope}>
      <AppCard className="h-full cursor-pointer overflow-hidden">
        <AppCardHeader className="flex-col items-start gap-0.5">
          <h2 className="text-x-md w-full truncate">{widget.name}</h2>

          {showFilters && <ActivityWidgetFilters state={state} store={store} widget={widget} />}
        </AppCardHeader>

        <AppCardBody className="min-h-0 flex-1 overflow-auto p-0" {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}>
          {body}
        </AppCardBody>
      </AppCard>
    </ActivityQueryProvider>
  );
});

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center gap-2 px-4 py-6 text-sm">
      <Icon className="size-3.5" icon={Clock} />

      <span>{label}</span>
    </div>
  );
}
