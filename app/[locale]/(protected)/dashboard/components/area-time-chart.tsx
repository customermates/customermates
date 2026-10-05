"use client";

import type { ChartDataPoint } from "./chart.types";

import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";

import { useChartFormatter } from "./use-chart-formatter";
import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  colors: string[];
  strokeColors: string[];
  gridColor: string;
  textColor: string;
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
  allowDecimals?: boolean;
};

export const AreaTimeChart = observer(
  ({
    currency,
    chartData,
    colors,
    strokeColors,
    gridColor,
    textColor,
    reverseXAxis,
    reverseYAxis,
    allowDecimals = true,
  }: Props) => {
    const formatValue = useChartFormatter(currency);
    const reducedMotion = useReducedMotion();
    const axisLabels = new Map(chartData.map((point) => [point.label, point.axisLabel ?? point.label]));
    const data = chartData.map((point) => ({ ...point, value: point.missing ? null : point.value }));

    return (
      <DashboardChartContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            minTickGap={12}
            reversed={Boolean(reverseXAxis)}
            stroke={gridColor}
            tick={{ fill: textColor, fontSize: 12 }}
            tickFormatter={(value) => axisLabels.get(String(value)) ?? String(value)}
            type="category"
          />

          <YAxis
            allowDecimals={allowDecimals}
            domain={[(minimum: number) => Math.min(0, minimum), (maximum: number) => Math.max(0, maximum)]}
            padding={{ top: 1, bottom: 1 }}
            reversed={Boolean(reverseYAxis)}
            stroke={gridColor}
            tick={{ fill: textColor, fontSize: 12 }}
            tickFormatter={(value) => formatValue(value, true)}
            type="number"
            width="auto"
          />

          <ChartTooltip currency={currency} filterNull={false} />

          <Area
            connectNulls={false}
            dataKey="value"
            dot={data.length === 1 ? { r: 3, fill: strokeColors[0], stroke: strokeColors[0] } : false}
            fill={colors[0]}
            fillOpacity={0.3}
            isAnimationActive={reducedMotion === false}
            stroke={strokeColors[0]}
            strokeWidth={2}
            type="linear"
          />
        </AreaChart>
      </DashboardChartContainer>
    );
  },
);
