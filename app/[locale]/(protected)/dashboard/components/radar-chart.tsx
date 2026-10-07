"use client";

import type { ChartDataPoint } from "./chart.types";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";

import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { TruncatedTick } from "./chart-theme";
import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  colors: string[];
};

export const RadarChartComponent = observer(({ currency, chartData, colors }: Props) => {
  const reducedMotion = useReducedMotion();
  return (
    <DashboardChartContainer>
      <RadarChart data={chartData}>
        <ChartTooltip currency={currency} />

        <PolarAngleAxis dataKey="label" tick={<TruncatedTick polar maxWidth={88} />} />

        <PolarGrid stroke="var(--border)" />

        <Radar
          dataKey="value"
          dot={{ fillOpacity: 1, r: 3, stroke: "var(--background)", strokeWidth: 2 }}
          fill={colors[0]}
          fillOpacity={0.3}
          isAnimationActive={reducedMotion === false}
          stroke={chartData[0]?.strokeColor || colors[0]}
          strokeWidth={2}
        />
      </RadarChart>
    </DashboardChartContainer>
  );
});
