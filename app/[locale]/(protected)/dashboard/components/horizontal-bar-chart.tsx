"use client";

import type { ChartDataPoint } from "./chart.types";

import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";

import { useChartFormatter } from "./use-chart-formatter";
import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  colors: string[];
  gridColor: string;
  textColor: string;
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
  allowDecimals?: boolean;
};

export const HorizontalBarChart = observer(
  ({ currency, chartData, colors, gridColor, textColor, reverseXAxis, reverseYAxis, allowDecimals = true }: Props) => {
    const formatValue = useChartFormatter(currency);
    const reducedMotion = useReducedMotion();

    return (
      <DashboardChartContainer>
        <BarChart data={chartData} layout="vertical">
          <XAxis
            allowDecimals={allowDecimals}
            domain={[(minimum: number) => Math.min(0, minimum), (maximum: number) => Math.max(0, maximum)]}
            padding={{ right: 1, left: 1 }}
            reversed={Boolean(reverseXAxis)}
            stroke={gridColor}
            tick={{
              fill: textColor,
              fontSize: 12,
            }}
            tickFormatter={(value) => formatValue(value, true)}
            type="number"
          />

          <YAxis
            dataKey="label"
            reversed={Boolean(reverseYAxis)}
            stroke={gridColor}
            tick={{
              fill: textColor,
              fontSize: 12,
            }}
            type="category"
            width="auto"
          />

          <ChartTooltip currency={currency} />

          <Bar dataKey="value" fill={colors[0]} isAnimationActive={reducedMotion === false} radius={4}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.strokeColor} strokeWidth={1.5} />
            ))}
          </Bar>
        </BarChart>
      </DashboardChartContainer>
    );
  },
);
