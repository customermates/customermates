"use client";

import type { ChartDataPoint } from "./chart.types";
import { isCurrencyAggregation } from "@/features/widget/widget-aggregation";

import { Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import { observer } from "mobx-react-lite";
import type { AggregationType } from "@/generated/prisma";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { ChartTooltip } from "@/components/chart/chart-tooltip";

import { DashboardChartContainer } from "./dashboard-chart-container";

type Props = {
  aggregationType?: AggregationType;
  chartData: ChartDataPoint[];
  colors: string[];
  gridColor: string;
  textColor: string;
  reverseXAxis?: boolean;
  reverseYAxis?: boolean;
};

export const VerticalBarChart = observer(
  ({ aggregationType, chartData, colors, gridColor, textColor, reverseXAxis, reverseYAxis }: Props) => {
    const intlStore = useHydratedIntlStore();

    return (
      <DashboardChartContainer>
        <BarChart data={chartData}>
          <XAxis
            dataKey="label"
            reversed={Boolean(reverseXAxis)}
            stroke={gridColor}
            tick={{ fill: textColor, fontSize: 12 }}
            type="category"
          />

          <YAxis
            domain={[0, "dataMax"]}
            padding={{ top: 1, bottom: 1 }}
            reversed={Boolean(reverseYAxis)}
            stroke={gridColor}
            tick={{ fill: textColor, fontSize: 12 }}
            tickFormatter={(value) =>
              isCurrencyAggregation(aggregationType) ? intlStore.formatCurrency(value) : intlStore.formatNumber(value)
            }
            type="number"
            width="auto"
          />

          <ChartTooltip aggregationType={aggregationType} />

          <Bar dataKey="value" fill={colors[0]} radius={4}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.strokeColor} strokeWidth={1.5} />
            ))}
          </Bar>
        </BarChart>
      </DashboardChartContainer>
    );
  },
);
