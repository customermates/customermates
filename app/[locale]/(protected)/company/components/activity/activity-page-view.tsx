"use client";

import { observer } from "mobx-react-lite";
import { useMemo } from "react";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DataViewLayout } from "@/components/data-view/data-view-layout";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { ActivitiesFeed, useRecordActivityViews } from "@/features/messaging/activities/record-activities-panel";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

const ActivityPageViewContent = observer(function ActivityPageView() {
  const store = useRecordActivityViews(null, false);
  const toolbar = useMemo(
    () => <DataViewToolbar isSearchable={false} showDisplayOptions={false} store={store} />,
    [store],
  );
  useSetTopBarActions(toolbar);

  return (
    <DataViewLayout showPagination={false} store={store}>
      <div className="h-full overflow-y-auto p-4">
        <ActivitiesFeed store={store} />
      </div>
    </DataViewLayout>
  );
});

export const ActivityPageView = serverRenderedClient(ActivityPageViewContent);
