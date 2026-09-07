"use client";

import type { ReactNode } from "react";
import type { ActivitiesResult } from "@/ee/messaging/activities/activities.schema";
import type { EntityType } from "@/generated/prisma";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";

import { FilterPopover } from "@/components/data-view/header/filter-popover";
import { PageState } from "@/components/page-state/page-state";

import { ActivitiesList, TimelineEmptyState, TimelineNotice } from "./activities-list";
import { ActivityTimelineSkeleton } from "./activity-timeline-skeleton";
import { resolveEntityTimelineState } from "./entity-timeline-state";
import { ActivityQueryProvider } from "./activity-query-context";
import { useOwnedActivitiesStore } from "./use-owned-activities-store";
import { ACTIVITIES_P13N_ID } from "./activities.store";
import { activityScopeForRecord } from "@/ee/messaging/activities/activity-scope.schema";
import { runUserAction } from "@/core/errors/report-application-error";

type Props = {
  entityType: EntityType;
  entityId: string;
  initial: ActivitiesResult;
};

export const EntityTimelinePanel = observer(({ entityType, entityId, initial }: Props) => {
  const t = useTranslations();
  const store = useOwnedActivitiesStore({
    scope: activityScopeForRecord(entityType, entityId),
    defaultP13nId: ACTIVITIES_P13N_ID,
    initial,
  });
  const timelineState = resolveEntityTimelineState({
    itemCount: store.items.length,
    request: store.dataRequest,
    scopeTruncated: store.scopeTruncated,
  });

  let body: ReactNode;
  switch (timelineState) {
    case "error":
      body = <TimelineEmptyState label={t("EntityTimeline.error")} />;
      break;
    case "scope-truncated":
      body = <TimelineEmptyState label={t("EntityTimeline.scopeTooBroad")} />;
      break;
    case "true-empty":
      body = (
        <PageState
          background={<ActivityTimelineSkeleton animated={false} />}
          description={t("ContactHistory.noActivity")}
          icon={Clock}
          state="empty"
          title={t("Common.actions.labelHistory")}
        />
      );
      break;
    case "content":
      body = (
        <ActivitiesList
          customColumns={store.customColumns}
          hasMore={store.hasMore}
          items={store.items}
          loading={store.loading}
          onLoadOlder={() => runUserAction(() => store.loadOlder())}
        />
      );
      break;
    default: {
      const exhaustive: never = timelineState;
      body = exhaustive;
    }
  }

  return (
    <ActivityQueryProvider filters={store.filters} scope={store.scope}>
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-1.5 px-4 pt-4 pb-1.5">
          <span className="text-muted-foreground text-xs font-normal">{t("Common.actions.labelHistory")}</span>

          <div className="ml-auto flex items-center gap-1.5">
            <FilterPopover compact store={store} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 pb-4">
          {store.scopeTruncated && store.items.length > 0 && (
            <TimelineNotice label={t("EntityTimeline.scopeTooBroad")} />
          )}

          {store.olderPageError && store.items.length > 0 && (
            <TimelineNotice label={t("EntityTimeline.loadOlderError")} />
          )}

          {store.pageLimitReached && <TimelineNotice label={t("EntityTimeline.pageLimitReached")} />}

          {body}
        </div>
      </div>
    </ActivityQueryProvider>
  );
});
