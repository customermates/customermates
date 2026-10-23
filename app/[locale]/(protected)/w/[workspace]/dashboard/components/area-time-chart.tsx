"use client";

import type { ChartDataPoint } from "./chart.types";

import { useId } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";

import { useChartFormatter } from "./use-chart-formatter";
import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { chartAxisProps, chartGridProps, chartLineCursor } from "./chart-theme";
import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  colors: string[];
  strokeColors: string[];
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
  allowDecimals?: boolean;
};

export const AreaTimeChart = observer(
  ({ currency, chartData, colors, strokeColors, reverseXAxis, reverseYAxis, allowDecimals = true }: Props) => {
    const formatValue = useChartFormatter(currency);
    const reducedMotion = useReducedMotion();
    const gradientId = `area-fill-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
    const axisLabels = new Map(chartData.map((point) => [point.label, point.axisLabel ?? point.label]));
    const data = chartData.map((point) => ({ ...point, value: point.missing ? null : point.value }));
    const stroke = strokeColors[0];

    return (
      <DashboardChartContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={colors[0]} stopOpacity={0.35} />

              <stop offset="100%" stopColor={colors[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid {...chartGridProps} vertical={false} />

          <XAxis
            {...chartAxisProps}
            dataKey="label"
            interval="preserveStartEnd"
            minTickGap={16}
            reversed={Boolean(reverseXAxis)}
            tickFormatter={(value) => axisLabels.get(String(value)) ?? String(value)}
            type="category"
          />

          <YAxis
            {...chartAxisProps}
            allowDecimals={allowDecimals}
            domain={[(minimum: number) => Math.min(0, minimum), "auto"]}
            reversed={Boolean(reverseYAxis)}
            tickFormatter={(value) => formatValue(value, true)}
            type="number"
            width="auto"
          />

          <ChartTooltip currency={currency} cursor={chartLineCursor} filterNull={false} />

          <Area
            activeDot={{ r: 4, fill: stroke, stroke: "var(--background)", strokeWidth: 2 }}
            connectNulls={false}
            dataKey="value"
            dot={data.length === 1 ? { r: 4, fill: stroke, stroke: "var(--background)", strokeWidth: 2 } : false}
            fill={`url(#${gradientId})`}
            fillOpacity={1}
            isAnimationActive={reducedMotion === false}
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </DashboardChartContainer>
    );
  },
);
