"use client";

import type { ChartDataPoint } from "./chart.types";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";

import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  colors: string[];
  textColor: string;
};

export const RadarChartComponent = observer(({ currency, chartData, colors, textColor }: Props) => {
  const reducedMotion = useReducedMotion();
  return (
    <DashboardChartContainer>
      <RadarChart data={chartData}>
        <ChartTooltip currency={currency} />

        <PolarAngleAxis dataKey="label" tick={{ fill: textColor, fontSize: 12 }} />

        <PolarGrid opacity={0.2} stroke={textColor} />

        <Radar
          dataKey="value"
          dot={{
            fillOpacity: 1,
            r: 4,
          }}
          fill={colors[0]}
          isAnimationActive={reducedMotion === false}
          stroke={chartData[0]?.strokeColor || colors[0]}
          strokeWidth={1.5}
        />
      </RadarChart>
    </DashboardChartContainer>
  );
});
