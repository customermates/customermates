"use client";

import type { ChartDataPoint } from "./chart.types";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { observer } from "mobx-react-lite";
import { useReducedMotion } from "framer-motion";

import { useChartFormatter } from "./use-chart-formatter";
import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { CHART_MAX_BAR_SIZE, TruncatedTick, chartAxisProps, chartBarCursor, chartGridProps } from "./chart-theme";
import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  currency?: string | null;
  chartData: ChartDataPoint[];
  colors: string[];
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
  allowDecimals?: boolean;
};

export const VerticalBarChart = observer(
  ({ currency, chartData, colors, reverseXAxis, reverseYAxis, allowDecimals = true }: Props) => {
    const formatValue = useChartFormatter(currency);
    const reducedMotion = useReducedMotion();

    return (
      <DashboardChartContainer>
        <BarChart barCategoryGap="24%" data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid {...chartGridProps} vertical={false} />

          <XAxis
            {...chartAxisProps}
            dataKey="label"
            interval={0}
            reversed={Boolean(reverseXAxis)}
            tick={<TruncatedTick />}
            type="category"
          />

          <YAxis
            {...chartAxisProps}
            allowDecimals={allowDecimals}
            domain={[(minimum: number) => Math.min(0, minimum), (maximum: number) => Math.max(0, maximum)]}
            reversed={Boolean(reverseYAxis)}
            tickFormatter={(value) => formatValue(value, true)}
            type="number"
            width="auto"
          />

          <ChartTooltip currency={currency} cursor={chartBarCursor} />

          <Bar
            dataKey="value"
            fill={colors[0]}
            isAnimationActive={reducedMotion === false}
            maxBarSize={CHART_MAX_BAR_SIZE}
            radius={reverseYAxis ? [0, 0, 4, 4] : [4, 4, 0, 0]}
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
