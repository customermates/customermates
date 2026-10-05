"use client";

import type { ChartDataPoint } from "./chart.types";

import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";

import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  textColor: string;
};

export const FunnelChart = observer(({ currency, chartData, textColor }: Props) => {
  const reducedMotion = useReducedMotion();
  const widest = Math.max(0, ...chartData.map((point) => point.value));
  const data = chartData.map((point) => ({ ...point, spacer: (widest - point.value) / 2 }));

  return (
    <DashboardChartContainer>
      <BarChart barCategoryGap="14%" data={data} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
        <XAxis hide domain={[0, widest || 1]} type="number" />

        <YAxis
          axisLine={false}
          dataKey="label"
          tick={{ fill: textColor, fontSize: 12 }}
          tickLine={false}
          type="category"
          width="auto"
          yAxisId="steps"
        />

        <YAxis
          axisLine={false}
          dataKey="detail"
          orientation="right"
          tick={{ fill: textColor, fontSize: 12 }}
          tickLine={false}
          type="category"
          width="auto"
          yAxisId="details"
        />

        <ChartTooltip currency={currency} />

        <Bar
          dataKey="spacer"
          fill="transparent"
          isAnimationActive={false}
          stackId="funnel"
          tooltipType="none"
          yAxisId="steps"
        >
          {data.map((_entry, index) => (
            <Cell key={`spacer-${index}`} fill="transparent" stroke="none" />
          ))}
        </Bar>

        <Bar dataKey="value" isAnimationActive={reducedMotion === false} radius={4} stackId="funnel" yAxisId="steps">
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.strokeColor} strokeWidth={1.5} />
          ))}
        </Bar>
      </BarChart>
    </DashboardChartContainer>
  );
});
