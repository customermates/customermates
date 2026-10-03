"use client";

import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { RecordWidgetChart } from "./record-widget-chart";

export function RecordWidgetCard({ widget }: { widget: RecordWidgetDto }) {
  return (
    <AppCard className="h-full cursor-pointer overflow-visible">
      <AppCardHeader>
        <h2 className="text-x-md w-full truncate">{widget.name}</h2>
      </AppCardHeader>

      <AppCardBody className="overflow-visible recharts-no-focus-outline">
        <RecordWidgetChart {...widget} />
      </AppCardBody>
    </AppCard>
  );
}
