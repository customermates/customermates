"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import type { RecordRef } from "@/features/records/record-model.schema";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { Button } from "@/components/ui/button";
import { DataViewViewsRail } from "@/components/data-view/views/data-view-views-rail";
import { FilterPopover } from "@/components/data-view/header/filter-popover";
import { ActivitiesList, TimelineEmptyState, TimelineNotice } from "./activities-list";
import { ActivityTimelineSkeleton } from "./activity-timeline-skeleton";
import { RecordActivityViewsStore } from "./record-activity-views.store";

export const RecordActivitiesPanel = observer(function RecordActivitiesPanel({
  record,
  viewSyncToUrl = false,
}: {
  record: RecordRef | null;
  viewSyncToUrl?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const root = useRootStore();
  const params = useSearchParams();
  const viewPathname = record
    ? `/${locale}/records/${record.typeId}/${record.recordId}`
    : `/${locale}/company/activity`;
  const requestedView =
    viewSyncToUrl && params.get("viewSurface") === SURFACE.entityTimeline ? params.get("view") : null;
  const [store] = useState(
    () => new RecordActivityViewsStore(root, record, viewPathname, viewSyncToUrl, requestedView ?? undefined),
  );
  const appliedView = useRef(requestedView);
  useEffect(() => {
    store.mount();
    runUserAction(() => store.load());
    const release = root.recordWorkspaceStore.subscribe(() => store.load());
    return () => {
      release();
      store.dispose();
    };
  }, [root, store]);
  useEffect(() => {
    if (appliedView.current === requestedView) return;
    appliedView.current = requestedView;
    store.followRequestedView(requestedView);
  }, [store, requestedView]);
  const error = store.error || store.dataRequest.status === "refresh-error";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {record ? t("Common.actions.labelHistory") : t("ActivityPage.description")}
        </span>

        <FilterPopover compact store={store} />
      </div>

      <DataViewViewsRail store={store} />

      {error && (
        <div className="space-y-2" role="status">
          <TimelineNotice label={t("EntityTimeline.error")} />

          <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(() => store.load())}>
            {t("ErrorCard.retry")}
          </Button>
        </div>
      )}

      {!store.isReady && !error ? (
        <ActivityTimelineSkeleton />
      ) : store.items.length ? (
        <ActivitiesList
          hasMore={store.hasMore}
          items={store.items}
          loading={store.loading}
          onLoadOlder={() => runUserAction(() => store.load(true))}
        />
      ) : (
        !error && <TimelineEmptyState label={t("Dashboard.activityWidget.noActivity")} />
      )}
    </div>
  );
});
