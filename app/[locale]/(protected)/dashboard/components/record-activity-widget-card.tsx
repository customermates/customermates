"use client";

import { runUserAction } from "@/core/errors/report-application-error";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import type { RecordActivityWidgetDto } from "@/features/widget/record-activity-widget.schema";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { ActivitiesList, TimelineNotice } from "@/features/messaging/activities/activities-list";
import { ActivityTimelineSkeleton } from "@/features/messaging/activities/activity-timeline-skeleton";
import { useRecordActivities } from "@/features/messaging/activities/use-record-activities";
import { ACTIVITY_KINDS, isChangeActivityKind } from "@/ee/messaging/activities/activities.schema";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  requestedRecordActivitySources,
  recordActivityFilterCount,
} from "@/ee/messaging/activities/record-activity-sources";
import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";
import { WIDGET_CARD_BODY_CLASS, WIDGET_CARD_HEADER_CLASS } from "./widget-card-frame";
import { WidgetSubtitle, WidgetTitle } from "./widget-subtitle";
import { cn } from "@/core/utils/cn";
import { accountSupportsActivitySources, resolveActivityWidgetState } from "./activity-widget-state";

export const RecordActivityWidgetCard = observer(
  ({ widget }: { widget: Pick<RecordActivityWidgetDto, "id" | "name" | "activityQuery" | "displayOptions"> }) => {
    const t = useTranslations();
    const root = useRootStore();
    const timeline = useRecordActivities(widget.activityQuery);
    const requested = requestedRecordActivitySources(widget.activityQuery);
    const available = requested.filter((kind) => timeline.available.includes(kind));
    const accountSources = available.filter((kind) => !isChangeActivityKind(kind));
    const needsAccount = accountSources.length > 0;
    useEffect(() => {
      if (needsAccount) void root.connectedAccountsStore.ensureLoaded().catch(() => undefined);
    }, [needsAccount, root]);
    const query = widget.activityQuery;
    const count = recordActivityFilterCount(query);
    const constrained =
      count > 0 ||
      query.kinds.length < ACTIVITY_KINDS.length ||
      Boolean(query.providers?.length || query.threadIds?.length || query.after || query.before);
    const state = resolveActivityWidgetState({
      accountsError: root.connectedAccountsStore.dataRequest.status === "refresh-error",
      accountsReady: !needsAccount || root.connectedAccountsStore.isReady,
      availableRequestedSources: available,
      constrained,
      connectedAccountCount: root.connectedAccountsStore.items.filter((account) =>
        accountSupportsActivitySources(account, accountSources),
      ).length,
      filtering: timeline.loading && !timeline.items.length,
      itemCount: timeline.items.length,
      loadError: timeline.error,
      ready: timeline.loaded || timeline.error,
      requestedSources: requested,
    });
    return (
      <AppCard className="h-full cursor-pointer overflow-hidden">
        <AppCardHeader className={WIDGET_CARD_HEADER_CLASS}>
          <WidgetTitle
            name={widget.name}
            notes={widget.displayOptions.showFilters ? [t("Dashboard.widgetEditor.tabs.filtersLabel", { count })] : []}
          />

          <WidgetSubtitle text={t("Dashboard.activityWidget.activityCount", { count: timeline.items.length })} />
        </AppCardHeader>

        <AppCardBody
          className={cn(WIDGET_CARD_BODY_CLASS, "min-h-0 flex-1 overflow-auto")}
          {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}
        >
          {timeline.error && (
            <div className="space-y-2" role="status">
              <TimelineNotice label={t("Dashboard.activityWidget.error")} />

              <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(() => timeline.load())}>
                {t("ErrorCard.retry")}
              </Button>
            </div>
          )}

          {state === "content" ? (
            <ActivitiesList
              hasMore={timeline.hasMore}
              items={timeline.items}
              loading={timeline.loading}
              onLoadOlder={() => runUserAction(() => timeline.load(true))}
            />
          ) : state === "loading" ? (
            <ActivityTimelineSkeleton />
          ) : (
            <PageState
              background={<ActivityTimelineSkeleton animated={false} rows={4} />}
              className="min-h-40"
              icon={Clock}
              state="empty"
              title={t(`Dashboard.activityWidget.${state}`)}
            />
          )}
        </AppCardBody>
      </AppCard>
    );
  },
);
