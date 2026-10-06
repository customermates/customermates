"use client";

import { RecordActivitiesPanel } from "@/features/messaging/activities/record-activities-panel";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

function ActivityPageViewContent() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <RecordActivitiesPanel record={null} />
    </div>
  );
}

export const ActivityPageView = serverRenderedClient(ActivityPageViewContent);
