"use client";

import type { RecordWidgetChartProps } from "./record-widget-chart";
import { AppCard } from "@/components/card/app-card";
import { RecordWidgetChart } from "./record-widget-chart";

export function RecordWidgetCard(props: RecordWidgetChartProps) {
  return (
    <AppCard className="h-full cursor-pointer overflow-visible">
      <RecordWidgetChart {...props} />
    </AppCard>
  );
}
