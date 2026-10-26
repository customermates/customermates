"use client";

import { chartPointAction } from "./chart-point-action";

import type { ChartDataPoint } from "./chart.types";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import { useState } from "react";
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
  const [width, setWidth] = useState(0);
  const labelWidth = Math.round(Math.min(88, Math.max(40, width * 0.16)));
  return (
    <DashboardChartContainer onResize={(next: number) => setWidth((current) => (current === next ? current : next))}>
      <RadarChart data={chartData} outerRadius={width > 0 && width < 420 ? "62%" : "75%"}>
        <ChartTooltip currency={currency} />

        <PolarAngleAxis dataKey="label" tick={<TruncatedTick polar maxWidth={labelWidth} />} />

        <PolarGrid stroke="var(--border)" />

        <Radar
          activeDot={{ pointerEvents: "none" }}
          dataKey="value"
          dot={({ cx, cy, index, fill }: { cx?: number; cy?: number; index: number; fill?: string }) =>
            cx == null || cy == null ? (
              <g key={index} />
            ) : (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                fill={fill}
                fillOpacity={1}
                r={3}
                stroke="var(--background)"
                strokeWidth={2}
                {...(chartData[index] ? chartPointAction(chartData[index]) : {})}
              />
            )
          }
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
