"use client";

import type { ChartDataPoint } from "./chart.types";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";

import { useChartFormatter } from "./use-chart-formatter";
import { ChartTooltip } from "@/components/chart/chart-tooltip";

import {
  CHART_MAX_BAR_SIZE,
  TruncatedTick,
  categoryAxisWidth,
  chartAxisProps,
  chartBarCursor,
  chartGridProps,
} from "./chart-theme";
import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  colors: string[];
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
  allowDecimals?: boolean;
};

export const HorizontalBarChart = observer(
  ({ currency, chartData, colors, reverseXAxis, reverseYAxis, allowDecimals = true }: Props) => {
    const formatValue = useChartFormatter(currency);
    const reducedMotion = useReducedMotion();
    const labelWidth = categoryAxisWidth(chartData.map((entry) => entry.label));

    return (
      <DashboardChartContainer>
        <BarChart
          barCategoryGap="24%"
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid {...chartGridProps} horizontal={false} />

          <XAxis
            {...chartAxisProps}
            allowDecimals={allowDecimals}
            domain={[(minimum: number) => Math.min(0, minimum), (maximum: number) => Math.max(0, maximum)]}
            reversed={Boolean(reverseXAxis)}
            tickFormatter={(value) => formatValue(value, true)}
            type="number"
          />

          <YAxis
            {...chartAxisProps}
            dataKey="label"
            interval={0}
            reversed={Boolean(reverseYAxis)}
            tick={<TruncatedTick vertical maxWidth={labelWidth - 8} />}
            type="category"
            width={labelWidth}
          />

          <ChartTooltip currency={currency} cursor={chartBarCursor} />

          <Bar
            dataKey="value"
            fill={colors[0]}
            isAnimationActive={reducedMotion === false}
            maxBarSize={CHART_MAX_BAR_SIZE}
            radius={reverseXAxis ? [4, 0, 0, 4] : [0, 4, 4, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </DashboardChartContainer>
    );
  },
);
