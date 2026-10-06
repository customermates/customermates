"use client";

import type { RecordWidgetChartProps } from "./record-widget-chart";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { RecordWidgetChart } from "./record-widget-chart";

export function RecordWidgetCard({ name, ...chart }: RecordWidgetChartProps & { name: string }) {
  return (
    <AppCard className="h-full cursor-pointer overflow-visible">
      <AppCardHeader>
        <h2 className="text-x-md w-full truncate">{name}</h2>
      </AppCardHeader>

      <AppCardBody className="overflow-visible recharts-no-focus-outline">
        <RecordWidgetChart {...chart} />
      </AppCardBody>
    </AppCard>
  );
}
